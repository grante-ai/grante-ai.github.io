/* Countries, and the states / provinces / regions for the countries we have lists for.
   Countries without a list get a plain text box for the state or region. */
import { h } from "./ui.js";
import { api } from "./api.js";

export const COUNTRIES = ["Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin",
  "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia",
  "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos",
  "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi",
  "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands",
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau",
  "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Republic of the Congo", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia",
  "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"];

export const REGIONS = {
  "United States": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
    "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
    "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
    "Oregon", "Pennsylvania", "Puerto Rico", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
    "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"],
  "Canada": ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories",
    "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"],
  "Australia": ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia",
    "Tasmania", "Victoria", "Western Australia"],
  "United Kingdom": ["England", "Northern Ireland", "Scotland", "Wales"],
  "India": ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
    "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal"],
  "Mexico": ["Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua", "Coahuila", "Colima",
    "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Mexico City", "Mexico State", "Michoacan", "Morelos", "Nayarit",
    "Nuevo Leon", "Oaxaca", "Puebla", "Queretaro", "Quintana Roo", "San Luis Potosi", "Sinaloa", "Sonora", "Tabasco",
    "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatan", "Zacatecas"],
};

const REGION_WORD = { "United States": "State", "Canada": "Province or territory", "Australia": "State or territory",
  "United Kingdom": "Country (nation)", "India": "State or territory", "Mexico": "State" };

function fieldBox(label, input) {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input);
}

/* The Country / State / Town fields, used at sign-up and in Account Settings.
   After a town is typed, Grante looks it up and asks the person to confirm it's the right one.
   Returns { node, values() } where values() gives {town, state, country} or throws a message. */
export function locationFields(start = {}) {
  const country = h("select", { autocomplete: "country-name" },
    ...COUNTRIES.map((c) => h("option", { value: c, selected: c === (start.country || "United States") }, c)));
  if (start.country && !COUNTRIES.includes(start.country)) country.prepend(h("option", { value: start.country, selected: true }, start.country));
  const town = h("input", { type: "text", autocomplete: "address-level2", maxlength: 60, value: start.town || "", placeholder: "Type your town or city" });
  const stateSlot = h("div", {});
  const check = h("div", { class: "town-check", hidden: true, "aria-live": "polite" });
  let state;
  let status = start.town ? "confirmed" : "empty";   // empty, checking, asking, confirmed, unchecked
  let timer, asked = 0;

  const regionWord = () => (REGION_WORD[country.value] || "State or region");
  const describe = (t) => [t.population ? `Population ${t.population.toLocaleString()}` : "", t.county ? `${t.county}${/county|parish|borough/i.test(t.county) || country.value !== "United States" ? "" : " County"}` : ""].filter(Boolean).join(" · ");
  const show = (...children) => { check.replaceChildren(...children); check.hidden = false; };

  function drawState(keep) {
    const list = REGIONS[country.value];
    if (list) {
      state = h("select", { autocomplete: "address-level1" },
        h("option", { value: "", selected: !keep, disabled: true }, `Choose your ${regionWord().toLowerCase()}`),
        ...list.map((r) => h("option", { value: r, selected: r === keep }, r)));
      if (keep && !list.includes(keep)) state.append(h("option", { value: keep, selected: true }, keep));
    } else {
      state = h("input", { type: "text", autocomplete: "address-level1", maxlength: 60, value: keep || "" });
    }
    state.addEventListener("change", () => lookSoon(0));
    stateSlot.replaceChildren(fieldBox(regionWord(), state));
  }

  function confirm(t, setState) {
    town.value = t.name;
    if (setState && t.state) drawState(t.state);
    status = "confirmed";
    check.className = "town-check good";
    show(h("p", {}, h("strong", {}, `${t.name}, ${t.state || country.value}`), " confirmed."),
      describe(t) ? h("p", { class: "muted small" }, describe(t)) : "");
  }

  const choice = (t, setState) => h("button", { type: "button", class: "town-option", onclick: () => confirm(t, setState) },
    h("strong", {}, `${t.name}, ${t.state || country.value}`), h("span", {}, describe(t) || "No details listed"));

  async function look() {
    const name = town.value.trim();
    if (name.length < 2) { status = "empty"; check.hidden = true; return; }
    if (!state.value.trim()) { status = "empty"; check.className = "town-check"; show(h("p", { class: "muted" }, `Choose your ${regionWord().toLowerCase()} first.`)); return; }
    const mine = ++asked;
    status = "checking"; check.className = "town-check";
    show(h("p", { class: "muted" }, "Looking up your town..."));
    let r;
    try { r = await api(`/places/town?name=${encodeURIComponent(name)}&state=${encodeURIComponent(state.value.trim())}&country=${encodeURIComponent(country.value)}`); }
    catch { r = { checked: false }; }
    if (mine !== asked) return;   // they kept typing; a newer lookup is on its way
    if (!r.checked) {
      status = "unchecked";
      return show(h("p", { class: "muted" }, "Grante couldn't look up towns right now, so please double-check the spelling."));
    }
    status = "asking";
    const where = state.value.trim();
    if (r.matches.length === 1) {
      const t = r.matches[0];
      return show(h("p", {}, "Is it ", h("strong", {}, `${t.name}, ${t.state || country.value}`), "?"),
        describe(t) ? h("p", { class: "muted small" }, describe(t)) : "",
        h("div", { class: "town-buttons" },
          h("button", { type: "button", class: "btn btn-small", onclick: () => confirm(t, false) }, "Yes, that's it"),
          h("button", { type: "button", class: "btn btn-ghost btn-small", onclick: () => { town.value = ""; status = "empty"; check.hidden = true; town.focus(); } }, "No")));
    }
    if (r.matches.length > 1) {
      return show(h("p", {}, `There's more than one ${r.matches[0].name} in ${where}. Which one is yours?`),
        h("div", { class: "town-options" }, ...r.matches.map((t) => choice(t, false))));
    }
    check.className = "town-check bad";
    if (r.others.length) {
      return show(h("p", {}, h("strong", {}, `No city found with this name in ${where}.`), " Did you mean one of these?"),
        h("div", { class: "town-options" }, ...r.others.map((t) => choice(t, true))));
    }
    show(h("p", {}, h("strong", {}, "No city found with this name."), " Check the spelling and try again."));
  }
  function lookSoon(wait = 600) {
    clearTimeout(timer); asked++;
    status = town.value.trim().length >= 2 ? "checking" : "empty";
    if (status === "empty") { check.hidden = true; return; }
    timer = setTimeout(look, wait);
  }

  town.addEventListener("input", () => lookSoon());
  country.addEventListener("change", () => { drawState(""); lookSoon(0); });
  drawState(start.state || "");

  return {
    node: h("div", { class: "form-stack" },
      h("div", { class: "grid-2" }, fieldBox("Country", country), stateSlot),
      fieldBox("Town or city", town), check),
    values() {
      if (!state.value.trim() || state.value.trim().length < 2) throw new Error(`Please choose your ${regionWord().toLowerCase()}.`);
      if (town.value.trim().length < 2) throw new Error("Please enter your town or city.");
      if (status === "checking") throw new Error("Hold on, Grante is still looking up your town.");
      if (status === "asking") throw new Error("Please confirm your town or city above first.");
      return { country: country.value, state: state.value.trim(), town: town.value.trim() };
    },
  };
}

/* The First name + Last initial fields. values() gives a display name like "Vedanth R." */
export function nameFields(displayName = "") {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const startInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const startFirst = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] || "");
  const first = h("input", { type: "text", autocomplete: "given-name", maxlength: 30, value: startFirst });
  const initial = h("input", { type: "text", autocomplete: "off", maxlength: 1, value: startInitial.toUpperCase(), class: "initial" });
  initial.addEventListener("input", () => { initial.value = initial.value.replace(/[^a-zA-Z]/g, "").toUpperCase(); });
  return {
    first, initial,
    node: h("div", { class: "name-row" }, fieldBox("First name", first), fieldBox("Last initial", initial)),
    values() {
      if (!first.value.trim()) throw new Error("Please enter your first name.");
      if (!/^[A-Za-z]$/.test(initial.value)) throw new Error("Please enter the first letter of your last name.");
      return `${first.value.trim().replace(/\s+/g, " ")} ${initial.value.toUpperCase()}.`;
    },
  };
}

/* A username box that only allows lowercase letters, numbers, and _ */
export function usernameInput(value = "") {
  const input = h("input", { type: "text", autocomplete: "username", maxlength: 20, value, spellcheck: false,
    autocapitalize: "none", autocorrect: "off" });
  input.addEventListener("input", () => {
    const clean = input.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean !== input.value) input.value = clean;
  });
  return input;
}
