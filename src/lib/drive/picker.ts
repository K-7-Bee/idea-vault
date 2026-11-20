// Browser only. Google Picker, loaded from Google only when the owner asks to choose something.
// Used by Settings (choose the Vault folder, 3A), project Files (link existing files, 3C) and story
// images (pictures only, 3D).
// The short-lived drive.file access token it needs is held in memory for the picker only.

export class PickerUnavailable extends Error {}

export type PickerConfig = { apiKey: string; appId: string };

type PickerData = { action: string; docs?: { id: string }[] };
type PickerView = {
  setIncludeFolders(v: boolean): PickerView; setSelectFolderEnabled(v: boolean): PickerView; setMimeTypes(m: string): PickerView;
};
type PickerBuilder = {
  setAppId(id: string): PickerBuilder; setOAuthToken(t: string): PickerBuilder; setDeveloperKey(k: string): PickerBuilder;
  addView(v: unknown): PickerBuilder; setCallback(cb: (data: PickerData) => void): PickerBuilder; setTitle(t: string): PickerBuilder;
  enableFeature(f: string): PickerBuilder; build(): { setVisible(v: boolean): void };
};
type PickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { FOLDERS: string; DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsView: new (viewId?: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
};
type GoogleWindow = Window & { gapi?: { load(name: string, done: () => void): void }; google?: { picker?: PickerNamespace } };

let pickerLoad: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  const w = window as GoogleWindow;
  pickerLoad ??= new Promise<PickerNamespace>((resolve, reject) => {
    const ready = () => w.gapi!.load("picker", () => (w.google?.picker ? resolve(w.google.picker) : reject(new Error("picker"))));
    if (w.gapi) return ready();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  }).catch((error) => { pickerLoad = null; throw error; });
  return pickerLoad;
}

// "folder": one folder (Settings). "files": any number of files, any type (project Files).
// "images": any number of pictures (story images).
// Resolves with the picked Drive IDs, or [] if the owner cancels.
export async function pickFromDrive(config: PickerConfig, token: string, mode: "folder" | "files" | "images"): Promise<string[]> {
  if (!config.apiKey || !config.appId) throw new PickerUnavailable("The Google Drive picker isn't configured on this server yet.");
  let picker: PickerNamespace;
  try {
    picker = await loadPicker();
  } catch {
    throw new PickerUnavailable("Google's file picker couldn't be loaded. Check your connection and try again.");
  }
  const view = mode === "folder"
    ? new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder")
    : mode === "images"
      ? new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes("image/png,image/jpeg,image/webp,image/gif")
      : new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
  return new Promise((resolve) => {
    let builder = new picker.PickerBuilder()
      .setTitle(mode === "folder" ? "Choose the folder for Idea Vault files" : mode === "images" ? "Choose pictures to link" : "Choose files to link to this project")
      .setAppId(config.appId)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .addView(view)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((d) => d.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (mode !== "folder") builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    builder.build().setVisible(true);
  });
}
