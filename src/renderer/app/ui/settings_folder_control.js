export function createSettingsFolderControl({ api, entry, onChange }) {
  const control = document.createElement("span");
  control.className = "settings-folder-control";

  const input = document.createElement("input");
  input.type = "text";
  if (entry.ui.placeholder) input.placeholder = String(entry.ui.placeholder);
  input.addEventListener("change", () => onChange(input.value || ""));

  const browse = document.createElement("button");
  browse.type = "button";
  browse.className = "settings-folder-browse";
  browse.textContent = "Browse…";
  browse.addEventListener("click", async () => {
    if (!api || typeof api.showOpenFolderDialog !== "function") return;
    const selected = await api.showOpenFolderDialog();
    if (!selected) return;
    input.value = String(selected);
    onChange(input.value);
  });

  control.append(input, browse);
  return { control, input };
}
