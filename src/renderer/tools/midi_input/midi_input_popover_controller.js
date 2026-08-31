function setCollapseState(el, expanded) {
  if (!el) return;
  const open = Boolean(expanded);
  el.classList.toggle("is-collapsed", !open);
  el.setAttribute("aria-hidden", open ? "false" : "true");
}

function formatMidiButtonLabel(state) {
  if (!state || !state.supported) return "MIDI: unsupported";
  if (!state.enabled) return "MIDI: off";
  if (state.muted) return "MIDI: muted";
  if (Number(state.devices) <= 0) return "MIDI: no device";
  return "MIDI: on";
}

function shouldShowMidiStatusButton(state) {
  return Boolean(state && state.enabled);
}

function clamp01(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

export function createMidiInputPopoverController({
  statusButton,
  popover,
  closeButton,
  enabledControl,
  mutedControl,
  keyAwareControl,
  gridControl,
  macroControl,
  macroNote,
  stateHint,
  enabledDependent,
  beepControl,
  beepDurationWrap,
  notePreviewControl,
  notePreviewDependent,
  notePreviewTriggerControl,
  previewSharedGroup,
  volumeControl,
  durationControl,
  setButtonText = (button, text) => { if (button) button.textContent = String(text || ""); },
  getState = () => ({}),
  onPatch = () => {},
  onUnlockAudio = () => {},
} = {}) {
  let open = false;

  const readState = () => {
    try {
      return getState() || {};
    } catch {
      return {};
    }
  };

  const position = () => {
    if (!popover || !statusButton) return;
    const rect = statusButton.getBoundingClientRect();
    popover.style.left = "0px";
    popover.style.top = "0px";
    popover.classList.remove("hidden");
    const popRect = popover.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - popRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    if (left + popRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popRect.width - 8);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  };

  const render = (stateArg) => {
    if (!statusButton) return;
    const state = stateArg || readState();
    const enabled = Boolean(state.enabled);
    const muted = Boolean(state.muted);
    const notePreviewEnabled = Boolean(state.notePreviewEnabled);
    const beepEnabled = Boolean(state.beepEnabled);
    const devices = Number(state.devices) || 0;

    setButtonText(statusButton, formatMidiButtonLabel(state));
    statusButton.title = "MIDI input controls";
    statusButton.classList.remove("midi-on", "midi-muted", "midi-off");
    if (!enabled) statusButton.classList.add("midi-off");
    else if (muted) statusButton.classList.add("midi-muted");
    else statusButton.classList.add("midi-on");
    const showStatusButton = shouldShowMidiStatusButton(state);
    statusButton.classList.toggle("hidden", !showStatusButton);
    statusButton.style.display = showStatusButton ? "" : "none";

    if (enabledControl) enabledControl.checked = enabled;
    setCollapseState(enabledDependent, enabled);
    if (mutedControl) {
      mutedControl.checked = muted;
      mutedControl.disabled = !enabled;
      const mutedLabel = mutedControl.closest("label");
      if (mutedLabel) mutedLabel.style.opacity = enabled ? "1" : "0.6";
    }
    if (keyAwareControl) keyAwareControl.checked = Boolean(state.keyAware);
    if (gridControl) gridControl.value = String(state.grid || "1/16");
    if (macroControl) macroControl.checked = Boolean(state.macro);
    if (macroNote) macroNote.style.display = state.macro ? "" : "none";
    if (beepControl) beepControl.checked = beepEnabled;
    setCollapseState(beepDurationWrap, enabled && beepEnabled);
    if (notePreviewControl) notePreviewControl.checked = notePreviewEnabled;
    setCollapseState(notePreviewDependent, notePreviewEnabled);
    if (notePreviewTriggerControl) {
      notePreviewTriggerControl.value = state.notePreviewTrigger === "note" ? "note" : "delimiter";
      notePreviewTriggerControl.disabled = !notePreviewEnabled;
      const triggerRow = notePreviewTriggerControl.closest(".midi-popover-row");
      if (triggerRow) triggerRow.style.opacity = notePreviewEnabled ? "1" : "0.6";
    }
    if (volumeControl) {
      volumeControl.value = String(Math.round(clamp01(state.notePreviewVolume) * 100));
    }
    if (durationControl) durationControl.value = String(Math.round(Number(state.beepDurationMs) || 0));
    setCollapseState(previewSharedGroup, notePreviewEnabled || (enabled && beepEnabled));
    if (stateHint) {
      let hint = "";
      if (!state.supported) hint = "MIDI input is unsupported in this environment.";
      else if (!enabled) hint = "Input is disabled.";
      else if (devices <= 0) hint = "No MIDI device connected.";
      else if (muted) hint = "Input is muted; incoming notes are ignored.";
      else hint = `Devices connected: ${devices}.`;
      stateHint.textContent = hint;
    }
  };

  const show = () => {
    if (!popover) return;
    open = true;
    render();
    position();
  };

  const close = () => {
    if (!popover) return;
    open = false;
    popover.classList.add("hidden");
  };

  const toggle = () => {
    if (open) close();
    else show();
  };

  if (statusButton) {
    statusButton.addEventListener("click", (e) => {
      if (e) e.preventDefault();
      toggle();
    });
  }
  if (closeButton) closeButton.addEventListener("click", close);
  if (enabledControl) {
    enabledControl.addEventListener("change", () => {
      onPatch({ midiInputEnabled: Boolean(enabledControl.checked) });
    });
  }
  if (mutedControl) {
    mutedControl.addEventListener("change", () => {
      onPatch({ midiInputMuted: Boolean(mutedControl.checked) });
    });
  }
  if (keyAwareControl) {
    keyAwareControl.addEventListener("change", () => {
      onPatch({ midiInputKeyAware: Boolean(keyAwareControl.checked) });
    });
  }
  if (gridControl) {
    gridControl.addEventListener("change", () => {
      onPatch({ midiInputGrid: String(gridControl.value || "1/16") });
    });
  }
  if (macroControl) {
    macroControl.addEventListener("change", () => {
      onPatch({ midiInputMacroEnabled: Boolean(macroControl.checked) });
    });
  }
  if (beepControl) {
    beepControl.addEventListener("change", async () => {
      const enabled = Boolean(beepControl.checked);
      onPatch({ midiInputBeepEnabled: enabled });
      if (enabled) await onUnlockAudio();
    });
  }
  if (notePreviewControl) {
    notePreviewControl.addEventListener("change", async () => {
      const enabled = Boolean(notePreviewControl.checked);
      onPatch({ noteTypingPreviewEnabled: enabled });
      if (enabled) await onUnlockAudio();
    });
  }
  if (notePreviewTriggerControl) {
    notePreviewTriggerControl.addEventListener("change", () => {
      const mode = String(notePreviewTriggerControl.value || "") === "note" ? "note" : "delimiter";
      onPatch({ noteTypingPreviewTrigger: mode });
    });
  }
  if (volumeControl) {
    volumeControl.addEventListener("input", () => {
      const raw = Number(volumeControl.value);
      if (!Number.isFinite(raw)) return;
      onPatch({ midiInputBeepVolume: raw / 100 });
    });
  }
  if (durationControl) {
    durationControl.addEventListener("input", () => {
      const raw = Number(durationControl.value);
      if (!Number.isFinite(raw)) return;
      onPatch({ midiInputBeepDuration: raw });
    });
  }

  document.addEventListener("click", (e) => {
    if (!open) return;
    const target = e.target;
    if (popover && popover.contains(target)) return;
    if (statusButton && statusButton.contains(target)) return;
    close();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  return {
    render,
    open: show,
    close,
    toggle,
    isOpen: () => open,
  };
}

export { shouldShowMidiStatusButton };
