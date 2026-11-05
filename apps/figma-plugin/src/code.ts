import { paletteSourceNodeIds } from "./figma-registry-store.js";
import { initializeLibrary } from "./library-messages.js";
import { handleCompositionMessage } from "./composition-messages.js";
import { handleTemplateMessage } from "./template-messages.js";
import { exportSelectedComposition } from "./figma-svg-export.js";
import { handleSceneMessage } from "./scene-messages.js";
import { postSceneEditorState, getEditableScene } from "./figma-scene-editor.js";

async function main(): Promise<void> {
  try {
    const library = await initializeLibrary();
    let messageQueue = Promise.resolve();

    figma.showUI(__html__, {
      width: 520,
      height: 740,
      themeColors: true
    });

    async function processMessage(
      unknownMessage: unknown
    ): Promise<void> {
      if (
        typeof unknownMessage !== "object" ||
        unknownMessage === null ||
        !("type" in unknownMessage)
      ) {
        return;
      }

      try {
        const message =
          unknownMessage as Record<string, unknown>;

        if (await library.handleMessage(message)) return;
        const state = library.state;
        if (await handleSceneMessage(message, state)) return;
        if (await handleCompositionMessage(message, state)) return;

        if (await handleTemplateMessage(message, {
          palettes: state.palettes,
          paletteSourceIds: paletteSourceNodeIds(state.palettes),
          registry: state.registry,
          sourceNodeIds: state.sourceNodeIds
        })) return;

        switch (message.type) {
          case "resize-ui": {
            if (typeof message.width === "number" && typeof message.height === "number" &&
                Number.isFinite(message.width) && Number.isFinite(message.height)) {
              figma.ui.resize(Math.round(Math.max(440, Math.min(1000, message.width))),
                Math.round(Math.max(560, Math.min(1000, message.height))));
            }
            break;
          }
          case "export-svg": {
            const scene = typeof message.sceneId === "string" ? await getEditableScene(message.sceneId) : undefined;
            const result = await exportSelectedComposition(paletteSourceNodeIds(state.palettes), scene);
            figma.ui.postMessage({ type: "svg-exported", ...result });
            break;
          }
        }
      } catch (error) {
        console.error(
          "Illustration Composer failed:",
          error
        );

        figma.ui.postMessage({
          type: "error",
          operation: typeof unknownMessage === "object" && unknownMessage !== null && "type" in unknownMessage
            ? unknownMessage.type : undefined,
          message: error instanceof Error
            ? error.message
            : String(error)
        });
      }
    }

    figma.ui.onmessage = (
      message: unknown
    ): Promise<void> => {
      messageQueue = messageQueue.then(
        () => processMessage(message)
      );

      return messageQueue;
    };

    figma.on("selectionchange", () => postSceneEditorState());
    library.sendReady();
  } catch (error) {
    console.error(
      "Illustration Composer initialization failed:",
      error
    );

    figma.notify(
      error instanceof Error
        ? error.message
        : "Initialization failed"
    );

    figma.closePlugin();
  }
}

void main();
