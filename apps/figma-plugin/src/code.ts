
async function main(): Promise<void> {
  try {
    const library = figma.root.children.find(
      page => page.name === "Библиотека компонентов"
    );

    if (!library) {
      figma.notify("Библиотека компонентов не найдена");
      return;
    }

    await library.loadAsync();

    const sections = library.children
      .filter(node => node.type === "SECTION")
      .map(node => node.name);

    console.log("Library sections:", sections);

    figma.notify(`Найдено разделов: ${sections.length}`);
  } catch (error) {
    console.error("Plugin error:", error);
    figma.notify("Ошибка при чтении библиотеки");
  } finally {
    figma.closePlugin();
  }
}

void main();
