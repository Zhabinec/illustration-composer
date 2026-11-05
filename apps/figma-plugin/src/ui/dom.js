export const element = id => document.getElementById(id);

export function fillSelect(select, options, preserve = true) {
  const previous = preserve ? select.value : "";
  select.replaceChildren();
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    select.appendChild(option);
  }
  if (previous && options.some(item => item.value === previous)) select.value = previous;
}
