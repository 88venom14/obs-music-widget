import { state, controls } from "../core/state.js";
import { isLastfmConfigured, isClientConfigured } from "../sources/credentials.js";

export function updateProviderUi() {
  const isLastfm = state.provider === "lastfm";
  controls.providerSpotify.checked = !isLastfm;
  controls.providerLastfm.checked = isLastfm;
  controls.spotifyProviderSettings.classList.toggle("hidden", isLastfm);
  controls.lastfmProviderSettings.classList.toggle("hidden", !isLastfm);
}

export function updateAuthUi() {
  if (state.provider === "lastfm") {
    const configured = isLastfmConfigured();
    controls.authStatus.textContent = configured ? "Last.fm подключен" : "Last.fm не настроен";
    controls.authStatus.classList.toggle("connected", configured);
    controls.login.disabled = true;
    controls.logout.disabled = true;
    return;
  }

  const connected = Boolean(state.previewAuth?.refreshToken);
  controls.authStatus.textContent = connected ? "Spotify подключен" : "Не подключено";
  controls.authStatus.classList.toggle("connected", connected);
  controls.login.disabled = !isClientConfigured();
  controls.logout.disabled = !connected;
}

export function showWarning(message) {
  if (!controls.warning) {
    return;
  }
  controls.warning.textContent = message;
  controls.warning.classList.remove("hidden");
}

export function hideWarning() {
  controls.warning?.classList.add("hidden");
}

export function updateBgControlsVisibility() {
  const type = controls.bgType.value;
  controls.bgGradientControls.classList.toggle("hidden", type !== "gradient");
  controls.bgImageControls.classList.toggle("hidden", type !== "image");
  controls.bgArtControls.classList.toggle("hidden", type !== "albumart");
}

export function updateFontControlsVisibility() {
  controls.fontCustomControls.classList.toggle("hidden", controls.fontFamily.value !== "custom");
}

export function enhanceSelect(select) {
  if (!select || select.dataset.enhanced) {
    return;
  }
  select.dataset.enhanced = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add("native-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const valueLabel = document.createElement("span");
  valueLabel.className = "select-value";
  trigger.appendChild(valueLabel);
  wrapper.appendChild(trigger);

  const list = document.createElement("ul");
  list.className = "select-list";
  list.setAttribute("role", "listbox");
  wrapper.appendChild(list);

  const options = Array.from(select.options);
  const optionEls = options.map((option) => {
    const item = document.createElement("li");
    item.className = "select-option";
    item.setAttribute("role", "option");
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setValue(option.value);
      close();
    });
    list.appendChild(item);
    return item;
  });

  function syncLabel() {
    const current = options.find((option) => option.value === select.value) || options[0];
    valueLabel.textContent = current ? current.textContent : "";
    for (const item of optionEls) {
      item.classList.toggle("selected", item.dataset.value === select.value);
    }
  }

  function setValue(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncLabel();
  }

  function open() {
    wrapper.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function close() {
    wrapper.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    wrapper.classList.contains("open") ? close() : open();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      close();
    }
  });

  select.addEventListener("change", syncLabel);
  syncLabel();
}
