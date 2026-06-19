"use strict";

// Apps Scriptをウェブアプリとして公開した後、発行された「/exec」のURLに置き換えてください。
const DATA_ENDPOINT = "https://script.google.com/macros/s/AKfycbzD1Isd8wL0hUu9yhFGzW6wE5TUZ6Dn0FoiRMo30ZHSHUB6EWRjeeVqvWl0Jh2QFvCz/exec";

const DEFAULT_CENTER = [36.2048, 138.2529];
const DEFAULT_ZOOM = 5;
const ALLOWED_TYPES = ["アパート", "駐車場"];
const ALLOWED_FREQUENCIES = ["月1回", "月2回"];

const map = L.map("map", { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markerLayer = L.featureGroup().addTo(map);
const menuToggle = document.querySelector("#menu-toggle");
const menuPanel = document.querySelector("#menu-panel");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchClearButton = document.querySelector("#search-clear");
const filterContainer = document.querySelector("#type-filter");
const propertyCount = document.querySelector("#property-count");
const emptyMessage = document.querySelector("#empty-message");
const noResultsMessage = document.querySelector("#no-results-message");
const locationButton = document.querySelector("#location-button");
const showAllButton = document.querySelector("#show-all-button");

let properties = [];
let selectedType = "すべて";
let activeKeyword = "";
let locationMarker = null;
let locationAccuracyCircle = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function isValidProperty(property) {
  return property
    && typeof property.name === "string"
    && property.name.trim() !== ""
    && typeof property.address === "string"
    && Number.isFinite(Number(property.latitude))
    && Number.isFinite(Number(property.longitude))
    && ALLOWED_TYPES.includes(property.type)
    && ALLOWED_FREQUENCIES.includes(property.cleaningFrequency)
    && typeof property.notes === "string"
    && typeof property.sheetUrl === "string";
}

function createPropertyIcon(type) {
  const isApartment = type === "アパート";
  return L.divIcon({
    className: "",
    html: `<div class="property-marker ${isApartment ? "apartment" : "parking"}"><span>${isApartment ? "建" : "P"}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
}

function buildPopup(property) {
  const destination = `${property.latitude},${property.longitude}`;
  const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const sheetUrl = safeExternalUrl(property.sheetUrl);
  const notes = property.notes.trim() || "なし";
  const sheetButton = sheetUrl
    ? `<a class="popup-button secondary" href="${escapeHtml(sheetUrl)}" target="_blank" rel="noopener noreferrer">物件シートを開く</a>`
    : '<span class="popup-button is-disabled" aria-disabled="true">物件シートなし</span>';

  return `
    <article class="property-popup">
      <h2>${escapeHtml(property.name)}</h2>
      <dl>
        <dt>住所</dt><dd>${escapeHtml(property.address)}</dd>
        <dt>物件種別</dt><dd>${escapeHtml(property.type)}</dd>
        <dt>清掃回数</dt><dd>${escapeHtml(property.cleaningFrequency)}</dd>
        <dt>注意事項</dt><dd>${escapeHtml(notes)}</dd>
      </dl>
      <div class="popup-actions">
        <a class="popup-button" href="${navigationUrl}" target="_blank" rel="noopener noreferrer">Googleマップでナビを開く</a>
        ${sheetButton}
      </div>
    </article>`;
}

function getFilteredProperties() {
  const keyword = activeKeyword.toLocaleLowerCase("ja");

  return properties.filter((property) => {
    const matchesType = selectedType === "すべて" || property.type === selectedType;
    const searchableText = `${property.name} ${property.address}`.toLocaleLowerCase("ja");
    return matchesType && searchableText.includes(keyword);
  });
}

function fitVisibleMarkers() {
  const bounds = markerLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.15), { padding: [45, 45], maxZoom: 16 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
}

function renderProperties({ fitBounds = true } = {}) {
  markerLayer.clearLayers();
  const filteredProperties = getFilteredProperties();

  filteredProperties.forEach((property) => {
    L.marker([Number(property.latitude), Number(property.longitude)], {
      icon: createPropertyIcon(property.type),
      title: property.name
    })
      .bindTooltip(escapeHtml(property.name), { direction: "top", offset: [0, -31] })
      .bindPopup(buildPopup(property), { maxWidth: 330 })
      .addTo(markerLayer);
  });

  emptyMessage.textContent = "清掃物件がまだ登録されていません";
  propertyCount.textContent = `${filteredProperties.length}件`;
  emptyMessage.hidden = properties.length !== 0;
  noResultsMessage.hidden = properties.length === 0 || filteredProperties.length !== 0;

  if (fitBounds) fitVisibleMarkers();
}

function showDataMessage(message) {
  properties = [];
  markerLayer.clearLayers();
  propertyCount.textContent = "0件";
  emptyMessage.textContent = message;
  emptyMessage.hidden = false;
  noResultsMessage.hidden = true;
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}

function setSelectedType(type) {
  selectedType = type;
  filterContainer.querySelectorAll("button[data-type]").forEach((button) => {
    const active = button.dataset.type === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setMenuOpen(open) {
  menuPanel.classList.toggle("is-closed", !open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.querySelector(".menu-icon").textContent = open ? "×" : "☰";
}

async function loadProperties() {
  const endpoint = DATA_ENDPOINT.trim();
  const endpointIsUnset = !endpoint
    || endpoint === "ここにApps ScriptのWebアプリURLを入力"
    || !/^https:\/\//i.test(endpoint);

  if (endpointIsUnset) {
    showDataMessage("Googleスプレッドシートとの接続が設定されていません");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("レスポンスが配列ではありません");

    properties = data.filter((property) => {
      const valid = isValidProperty(property);
      if (!valid) console.warn("形式が正しくない物件データを除外しました:", property);
      return valid;
    });
    renderProperties();
  } catch (error) {
    console.error(error);
    showDataMessage("清掃物件データを読み込めませんでした");
  }
}

menuToggle.addEventListener("click", () => {
  setMenuOpen(menuPanel.classList.contains("is-closed"));
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  activeKeyword = searchInput.value.trim();
  renderProperties();
});

searchClearButton.addEventListener("click", () => {
  searchInput.value = "";
  activeKeyword = "";
  renderProperties();
  searchInput.focus();
});

filterContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-type]");
  if (!button) return;
  setSelectedType(button.dataset.type);
  renderProperties();
});

showAllButton.addEventListener("click", () => {
  searchInput.value = "";
  activeKeyword = "";
  setSelectedType("すべて");
  renderProperties();
});

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    window.alert("この端末では現在地を取得できません");
    return;
  }

  locationButton.disabled = true;
  locationButton.lastElementChild.textContent = "取得中";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const currentPosition = [position.coords.latitude, position.coords.longitude];
      if (locationMarker) map.removeLayer(locationMarker);
      if (locationAccuracyCircle) map.removeLayer(locationAccuracyCircle);

      locationAccuracyCircle = L.circle(currentPosition, {
        radius: position.coords.accuracy,
        color: "#2f7bd0",
        weight: 1,
        fillColor: "#2f7bd0",
        fillOpacity: 0.12
      }).addTo(map);

      locationMarker = L.circleMarker(currentPosition, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2276d2",
        fillOpacity: 1
      }).bindPopup("現在地").addTo(map);

      map.setView(currentPosition, 16);
      locationMarker.openPopup();
      locationButton.disabled = false;
      locationButton.lastElementChild.textContent = "現在地";
    },
    () => {
      window.alert("現在地を取得できませんでした。端末の位置情報設定をご確認ください");
      locationButton.disabled = false;
      locationButton.lastElementChild.textContent = "現在地";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
});

if (window.matchMedia("(max-width: 680px)").matches) {
  setMenuOpen(false);
}

loadProperties();
