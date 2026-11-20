"use client";

import { useState } from "react";
import type { DriveStatus } from "@/lib/drive/connection";
import type { CallbackResult } from "@/lib/drive/flow";

const RESULT_TEXT: Record<CallbackResult, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Drive is connected." },
  denied: { ok: false, text: "Connection cancelled. Nothing was changed." },
  state: { ok: false, text: "That connection attempt couldn't be verified. Nothing was saved; please try again." },
  expired: { ok: false, text: "That connection attempt took too long. Nothing was saved; please try again." },
  user: { ok: false, text: "That connection attempt belonged to a different Vault session. Nothing was saved." },
  scope: { ok: false, text: "Google didn't grant exactly the “files used with this app” permission. Nothing was saved and the grant was revoked." },
  account: { ok: false, text: "That Google account isn't the one allowed for this Vault. Nothing was saved and the grant was revoked." },
  no_refresh: { ok: false, text: "Google didn't return a lasting permission. Nothing was saved; please try again." },
  google: { ok: false, text: "Google couldn't complete the connection. Nothing was saved; please try again." },
  not_configured: { ok: false, text: "Drive isn't configured on this server yet." },
  storage: { ok: false, text: "The connection couldn't be saved. The grant was revoked; please try again." },
};

const FOLDER_ERRORS: Record<string, string> = {
  not_granted: "The Vault can't see that folder. Choose it again in the picker.",
  not_a_folder: "That item isn't a folder.",
  trashed: "That folder is in the Drive trash.",
  read_only: "You can't add files to that folder.",
  cannot_write: "Google refused a test write into that folder, so it wasn't saved.",
  reconnect: "Drive needs reconnecting first.",
  not_connected: "Connect Google Drive first.",
};

type PickerConfig = { apiKey: string; appId: string };

export default function DriveSettings({ initial, result, picker }: {
  initial: DriveStatus; result: CallbackResult | null; picker: PickerConfig;
}) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<null | "disconnect" | "folder">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(result ? RESULT_TEXT[result] : null);

  async function disconnect() {
    if (!window.confirm("Disconnect Google Drive? Files already in your Drive stay there.")) return;
    setBusy("disconnect");
    setMessage(null);
    try {
      const response = await fetch("/api/drive/disconnect", { method: "POST", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; revoked?: boolean };
      if (!response.ok || !body.ok) {
        setMessage({ ok: false, text: "Drive couldn't be disconnected. Nothing was changed; please try again." });
        return;
      }
      setStatus({ state: "not_connected" });
      setMessage(body.revoked
        ? { ok: true, text: "Google Drive is disconnected and the Vault's access was revoked." }
        : { ok: false, text: "Disconnected here, but Google couldn't be reached to revoke access. Remove “Idea Vault” at myaccount.google.com → Security → Third-party connections." });
    } catch {
      setMessage({ ok: false, text: "Drive couldn't be disconnected. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function chooseFolder() {
    setBusy("folder");
    setMessage(null);
    try {
      const tokenResponse = await fetch("/api/drive/picker-token", { method: "POST", cache: "no-store" });
      const tokenBody = await tokenResponse.json().catch(() => ({})) as { token?: string; error?: string };
      if (!tokenResponse.ok || !tokenBody.token) {
        if (tokenBody.error === "reconnect" && status.state === "connected") setStatus({ ...status, state: "reconnect" });
        setMessage({ ok: false, text: FOLDER_ERRORS[tokenBody.error ?? ""] ?? "Drive couldn't be reached. Please try again." });
        return;
      }
      const picked = await pickFolder(picker, tokenBody.token);
      if (!picked) return;
      const response = await fetch("/api/drive/folder", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: picked }),
      });
      const body = await response.json().catch(() => ({})) as { folder?: { id: string; name: string }; error?: string; probeLeft?: boolean };
      if (!response.ok || !body.folder) {
        setMessage({ ok: false, text: FOLDER_ERRORS[body.error ?? ""] ?? "The folder couldn't be saved. Please try again." });
        return;
      }
      if (status.state === "connected" || status.state === "reconnect") setStatus({ ...status, folder: body.folder });
      setMessage({ ok: true, text: body.probeLeft
        ? `New files will be saved in “${body.folder.name}”. A test file named “Idea Vault write check (safe to delete)” couldn't be removed; you can delete it.`
        : `New files will be saved in “${body.folder.name}”.` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof PickerUnavailable ? error.message : "The folder couldn't be saved. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <h3 className="text-lg font-semibold">Google Drive</h3>
      <p className="mt-1 text-sm text-muted">
        New attachments and recordings will be stored in a Drive folder you choose. The Vault can only see files it
        saves there; it can&apos;t see the rest of your Drive. Existing attachments stay where they are.
      </p>

      {message && (
        <p role={message.ok ? "status" : "alert"}
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${message.ok ? "border-line" : "border-red-500/50 text-red-700 dark:text-red-300"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-5 space-y-4 text-sm">
        {status.state === "not_configured" && <p>Drive isn&apos;t configured on this server yet.</p>}
        {status.state === "unavailable" && (
          <p>Drive status couldn&apos;t be checked. <a className="underline" href="/vault/settings">Try again</a></p>
        )}
        {status.state === "not_connected" && (
          <>
            <p>Not connected.</p>
            <a href="/api/drive/connect" className="inline-block rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent">
              Connect Google Drive
            </a>
          </>
        )}
        {(status.state === "connected" || status.state === "reconnect") && (
          <>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted">Account</dt>
              <dd className="break-all">{status.account}</dd>
              <dt className="text-muted">Status</dt>
              <dd>{status.state === "connected" ? "Connected" : "Needs reconnecting"}</dd>
              <dt className="text-muted">Folder</dt>
              <dd className="break-words">{status.folder ? status.folder.name : "Not chosen yet"}</dd>
            </dl>
            {status.state === "reconnect" && (
              <p>Google access has expired or was removed. Reconnect to keep using Drive; nothing in Drive is affected.</p>
            )}
            <div className="flex flex-wrap gap-3">
              {status.state === "reconnect" ? (
                <a href="/api/drive/connect" className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent">Reconnect Google Drive</a>
              ) : (
                <button type="button" onClick={chooseFolder} disabled={busy !== null}
                  className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-60">
                  {busy === "folder" ? "Choosing…" : status.folder ? "Change folder" : "Choose folder"}
                </button>
              )}
              <button type="button" onClick={disconnect} disabled={busy !== null}
                className="rounded-xl border border-line px-4 py-2.5 font-semibold disabled:opacity-60">
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

class PickerUnavailable extends Error {}

// Minimal shapes of the Google Picker API that this page uses.
type PickerData = { action: string; docs?: { id: string }[] };
type PickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { FOLDERS: string };
  DocsView: new (viewId: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
};
type PickerView = {
  setIncludeFolders(v: boolean): PickerView; setSelectFolderEnabled(v: boolean): PickerView; setMimeTypes(m: string): PickerView;
};
type PickerBuilder = {
  setAppId(id: string): PickerBuilder; setOAuthToken(t: string): PickerBuilder; setDeveloperKey(k: string): PickerBuilder;
  addView(v: unknown): PickerBuilder; setCallback(cb: (data: PickerData) => void): PickerBuilder; setTitle(t: string): PickerBuilder;
  build(): { setVisible(v: boolean): void };
};
type GoogleWindow = Window & { gapi?: { load(name: string, done: () => void): void }; google?: { picker?: PickerNamespace } };

let pickerLoad: Promise<PickerNamespace> | null = null;

// Loads Google's picker script only when the owner asks to choose a folder.
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

async function pickFolder(config: PickerConfig, token: string): Promise<string | null> {
  if (!config.apiKey || !config.appId) throw new PickerUnavailable("The folder picker isn't configured on this server yet.");
  let picker: PickerNamespace;
  try {
    picker = await loadPicker();
  } catch {
    throw new PickerUnavailable("Google's folder picker couldn't be loaded. Check your connection and try again.");
  }
  const view = new picker.DocsView(picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes("application/vnd.google-apps.folder");
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .setTitle("Choose the folder for Idea Vault files")
      .setAppId(config.appId)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .addView(view)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
