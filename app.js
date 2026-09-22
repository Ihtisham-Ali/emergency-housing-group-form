/* app.js — Main form logic */

/* ============================================================
   CONFIG
============================================================ */
const LOQATE_API_KEY    = "CT49-NU82-UH14-XA45";
// Same-origin relay (submit.php) — browser only needs to resolve this site.
const WEBHOOK_URL       = "/submit.php";
const MAX_IMAGE_DIMENSION = 1920; // longest side, px
const IMAGE_JPEG_QUALITY  = 0.82;

// Supabase — files are uploaded directly from the browser to Storage,
// so photos/videos never pass through submit.php or Make.com.
// The anon key is public-safe (read the RLS policies in Supabase).
const SUPABASE_URL      = 'https://dpmzxkxcppqfnkkyysbj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwbXp4a3hjcHBxZm5ra3l5c2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjM1MzYsImV4cCI6MjEwMjYzOTUzNn0.AL6l_viH44wBb0VgW8TrDxodX505MPcNeEPrp84egqs';

// Lazily initialise the Supabase client once the CDN script is loaded.
function getSupabaseClient() {
  if (!window._ehgSupabase) {
    window._ehgSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window._ehgSupabase;
}

/* Upload every file in `files` to Supabase Storage and return an array
   of public URLs. Calls onProgress(0–85, label) as each file completes. */
async function uploadFilesToSupabase(files, onProgress) {
  const client     = getSupabaseClient();
  const urls       = [];
  const total      = files.length;
  const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (let i = 0; i < total; i++) {
    if (onProgress) {
      onProgress(
        Math.round((i / total) * 82),
        'Uploading photo ' + (i + 1) + ' of ' + total + '…'
      );
    }
    const file     = files[i];
    const random   = Math.random().toString(36).substring(2, 10);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = datePrefix + '/' + random + '_' + safeName;

    const { error } = await client.storage
      .from('maintenance-files')
      .upload(path, file, { cacheControl: '31536000', upsert: false });

    if (error) throw new Error('Upload failed for ' + file.name + ': ' + error.message);

    const { data: urlData } = client.storage
      .from('maintenance-files')
      .getPublicUrl(path);

    urls.push(urlData.publicUrl);
  }
  return urls;
}

/* ============================================================
   STATE
============================================================ */
let state = {
  currentStep: 1,
  addressConfirmed: false,
  selectedIssue: null,
  tenantPriority: "",
  uploadedFiles: [],
  ts: {},           // key: question id, value: answer value
  tsQA: [],         // array of {q: "question text", a: "answer label"}
  tsBuiltForCode: null, // track which issue the troubleshoot was built for
  hasTroubleshoot: true, // false = no questions for this issue type → skip step 3
  internal: {
    engineer_required: false,
    request_closed: false,
    responsibility_type: "",
    priority: "normal",
    alert_type: "",
    troubleshooting_path: [],
    final_action: ""
  }
};

/* ============================================================
   INIT
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  buildIssueDropdown();
  setupAddressLookup();
  setupDragDrop();
  document.getElementById("repair-form").addEventListener("submit", handleSubmit);

  // Close dropdowns on outside click
  document.addEventListener("click", e => {
    const issueWrap = document.getElementById("issue-select-wrap");
    const issueDd = document.getElementById("issue-dropdown");
    if (issueWrap && issueDd && !issueWrap.contains(e.target)) {
      issueDd.classList.add("hidden");
    }
    const priWrap = document.getElementById("priority-select-wrap");
    const priDd = document.getElementById("priority-dropdown");
    if (priWrap && priDd && !priWrap.contains(e.target)) {
      priDd.classList.add("hidden");
    }
    const addrWrap = document.querySelector(".address-lookup-wrapper");
    const addrDd = document.getElementById("address-dropdown");
    if (addrWrap && addrDd && !addrWrap.contains(e.target)) {
      addrDd.classList.add("hidden");
    }
    // Close video modal on backdrop click
    if (e.target.id === "video-modal") {
      closeVideoModal();
    }
  });

  // ESC closes video modal
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeVideoModal();
  });
});

/* ============================================================
   STEP NAVIGATION
============================================================ */
function goToStep(n) {
  if (n > state.currentStep) {
    if (!validateStep(state.currentStep)) return;
  }

  if (n === 3) {
    // Only rebuild troubleshoot if the issue changed
    const code = state.selectedIssue ? state.selectedIssue.code : null;
    if (state.tsBuiltForCode !== code) {
      buildTroubleshootSection();
      state.tsBuiltForCode = code;
    }

    // Check if any actual questions were generated
    const container = document.getElementById("troubleshoot-container");
    const hasQuestions = container && container.querySelector(".ts-question");
    if (!hasQuestions) {
      // No troubleshooting needed — skip step 3, go straight to review
      state.hasTroubleshoot = false;
      _showStep(4);
      buildReviewGrid();
      return;
    }
    state.hasTroubleshoot = true;
  }

  if (n === 4) {
    buildReviewGrid();
  }

  _showStep(n);
}

// Internal: show a step by number and update indicators
function _showStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("step-" + i);
    if (el) el.style.display = "none";
  }
  const target = document.getElementById("step-" + n);
  if (target) target.style.display = "block";
  state.currentStep = n;
  updateStepIndicators(n);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Back button on step 4 — skip step 3 if it has no questions
function goBackFromReview() {
  goToStep(state.hasTroubleshoot ? 3 : 2);
}

function updateStepIndicators(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById("step-indicator-" + i);
    if (!el) continue;
    el.classList.remove("active", "done");
    if (i < n) el.classList.add("done");
    else if (i === n) el.classList.add("active");
  }
}

/* ============================================================
   VALIDATION
============================================================ */
/* ============================================================
   REAL-TIME INLINE VALIDATORS
============================================================ */
function validateEmailInline(input) {
  const val = (input.value || "").trim();
  const errEl = document.getElementById("email-error");
  if (!val) {
    if (errEl) errEl.textContent = "";
    input.classList.remove("error");
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
    if (errEl) errEl.textContent = "Please enter a valid email address.";
    input.classList.add("error");
  } else {
    if (errEl) errEl.textContent = "";
    input.classList.remove("error");
  }
}

function validatePhoneInline(input) {
  const raw = (input.value || "").replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");
  const errEl = document.getElementById("phone-error");
  const wrap = input.closest(".phone-input-wrap");

  // Compose full number for hidden field
  const hiddenPhone = document.getElementById("phone");
  if (hiddenPhone) hiddenPhone.value = digits ? "+44" + digits : "";

  if (!digits) {
    if (errEl) errEl.textContent = "";
    if (wrap) wrap.classList.remove("error");
    return;
  }
  // UK subscriber number after +44 is 10 digits (e.g. 7911123456)
  if (digits.length < 10) {
    if (errEl) errEl.textContent = "UK numbers need 10 digits after +44 (e.g. 7700 000000).";
    if (wrap) wrap.classList.add("error");
  } else if (digits.length > 10) {
    if (errEl) errEl.textContent = "Number too long — please enter 10 digits after +44.";
    if (wrap) wrap.classList.add("error");
  } else {
    if (errEl) errEl.textContent = "";
    if (wrap) wrap.classList.remove("error");
  }
}

function validateStep(step) {
  let ok = true;

  function setErr(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
    ok = false;
  }
  function clearErr(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
  function markErr(id) { const el = document.getElementById(id); if (el) el.classList.add("error"); }
  function clearMark(id) { const el = document.getElementById(id); if (el) el.classList.remove("error"); }

  if (step === 1) {
    const name = (document.getElementById("name").value || "").trim();
    const email = (document.getElementById("email").value || "").trim();

    // Phone: read from hidden field (composed by validatePhoneInline)
    const digitsInput = document.getElementById("phone-digits");
    const digits = digitsInput ? digitsInput.value.replace(/\s/g, "").replace(/\D/g, "") : "";
    const hiddenPhone = document.getElementById("phone");
    if (hiddenPhone) hiddenPhone.value = digits ? "+44" + digits : "";

    if (!name) { setErr("name-error", "Please enter your full name."); markErr("name"); }
    else { clearErr("name-error"); clearMark("name"); }

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErr("email-error", "Please enter a valid email address."); markErr("email");
    } else { clearErr("email-error"); clearMark("email"); }

    const phoneWrap = document.querySelector(".phone-input-wrap");
    if (!digits) {
      setErr("phone-error", "Please enter your phone number.");
      if (phoneWrap) phoneWrap.classList.add("error");
    } else if (digits.length !== 10) {
      setErr("phone-error", digits.length < 10
        ? "UK numbers need 10 digits after +44."
        : "Number too long — 10 digits expected after +44.");
      if (phoneWrap) phoneWrap.classList.add("error");
    } else {
      clearErr("phone-error");
      if (phoneWrap) phoneWrap.classList.remove("error");
    }

    if (!state.addressConfirmed) { setErr("address-error", "Please select a valid address from the dropdown."); }
    else { clearErr("address-error"); }
  }

  if (step === 2) {
    if (!state.selectedIssue) {
      setErr("issue-error", "Please select an issue type.");
    } else {
      clearErr("issue-error");
    }

    // priority question removed — internal priority still set by issue type / troubleshooting

    const info = (document.getElementById("further-info").value || "").trim();
    if (!info) {
      setErr("further-info-error", "Please provide further information about the issue.");
      markErr("further-info");
    } else {
      clearErr("further-info-error");
      clearMark("further-info");
    }

    if (!state.uploadedFiles || state.uploadedFiles.length === 0) {
      const uploadArea = document.getElementById("upload-area");
      if (uploadArea) uploadArea.style.borderColor = "var(--error)";
      setErr("upload-error", "Please upload at least one photo or video of the issue.");
    } else {
      const uploadArea = document.getElementById("upload-area");
      if (uploadArea) uploadArea.style.borderColor = "";
      clearErr("upload-error");
    }

    if (state.selectedIssue && state.selectedIssue.code === "RC-999G") {
      const other = (document.getElementById("other-issue").value || "").trim();
      if (!other) {
        setErr("other-issue-error", "Please describe the issue.");
        markErr("other-issue");
      } else {
        clearErr("other-issue-error");
        clearMark("other-issue");
      }
    }
  }

  if (step === 4) {
    if (!document.getElementById("consent-check").checked) {
      setErr("consent-error", "Please confirm your consent before submitting.");
    } else {
      clearErr("consent-error");
    }
  }

  return ok;
}

/* ============================================================
   ADDRESS LOOKUP (LOQATE)
============================================================ */
let debounceTimer;

function setupAddressLookup() {
  const input = document.getElementById("address-search");
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const val = input.value.trim();
    if (val.length < 3) {
      document.getElementById("address-dropdown").classList.add("hidden");
      return;
    }
    debounceTimer = setTimeout(() => loqateFindAddress(val), 350);
  });
}

async function loqateFindAddress(text) {
  const spinner = document.getElementById("address-spinner");
  const dropdown = document.getElementById("address-dropdown");
  spinner.classList.remove("hidden");
  dropdown.classList.add("hidden");
  try {
    const url = `https://api.addressy.com/Capture/Interactive/Find/v1.10/json3.ws?Key=${LOQATE_API_KEY}&Text=${encodeURIComponent(text)}&IsMiddleware=False&Countries=GB&Limit=10&Language=en-gb`;
    const res = await fetch(url);
    const data = await res.json();
    renderAddressDropdown(data.Items || []);
  } catch (_) {
    renderAddressDropdown([]);
  } finally {
    spinner.classList.add("hidden");
  }
}

function renderAddressDropdown(items) {
  const dropdown = document.getElementById("address-dropdown");
  dropdown.innerHTML = "";
  if (!items.length) {
    dropdown.innerHTML = '<div class="address-option no-results">No addresses found. Try a different postcode or address.</div>';
    dropdown.classList.remove("hidden");
    return;
  }
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "address-option";
    div.textContent = item.Text + (item.Description ? " " + item.Description : "");
    div.addEventListener("click", () => {
      if (item.Type === "Address") selectAddress(item);
      else loqateFindAddressContainer(item.Id);
    });
    dropdown.appendChild(div);
  });
  dropdown.classList.remove("hidden");
}

async function loqateFindAddressContainer(containerId) {
  const spinner = document.getElementById("address-spinner");
  spinner.classList.remove("hidden");
  try {
    const url = `https://api.addressy.com/Capture/Interactive/Find/v1.10/json3.ws?Key=${LOQATE_API_KEY}&Text=&Container=${containerId}&IsMiddleware=False&Countries=GB&Limit=25&Language=en-gb`;
    const res = await fetch(url);
    const data = await res.json();
    renderAddressDropdown(data.Items || []);
  } catch (_) {
    renderAddressDropdown([]);
  } finally {
    spinner.classList.add("hidden");
  }
}

function selectAddress(item) {
  fetch(`https://api.addressy.com/Capture/Interactive/Retrieve/v1.20/json3.ws?Key=${LOQATE_API_KEY}&Id=${encodeURIComponent(item.Id)}`)
    .then(r => r.json())
    .then(data => {
      const a = (data.Items || [])[0] || {};
      const full = [a.Line1, a.Line2, a.Line3, a.City, a.PostalCode].filter(Boolean).join(", ");
      document.getElementById("full-address").value = full || item.Text;
      document.getElementById("postcode").value = a.PostalCode || "";
      document.getElementById("address-line1").value = a.Line1 || "";
      document.getElementById("address-line2").value = a.Line2 || "";
      document.getElementById("address-line3").value = a.Line3 || "";
      document.getElementById("city").value = a.City || a.AdminAreaName || "";
      document.getElementById("address-selected-text").textContent = full || item.Text;
    })
    .catch(() => {
      const full = item.Text + (item.Description ? " " + item.Description : "");
      document.getElementById("full-address").value = full;
      document.getElementById("address-selected-text").textContent = full;
    })
    .finally(() => {
      document.getElementById("address-dropdown").classList.add("hidden");
      document.getElementById("address-search").value = "";
      document.getElementById("address-selected").classList.remove("hidden");
      document.getElementById("address-error").textContent = "";
      state.addressConfirmed = true;
    });
}

function clearAddress() {
  state.addressConfirmed = false;
  document.getElementById("address-selected").classList.add("hidden");
  document.getElementById("address-search").value = "";
  ["full-address", "postcode", "address-line1", "address-line2", "address-line3", "city"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* ============================================================
   ISSUE DROPDOWN — flat list, no group headers
============================================================ */
function buildIssueDropdown() {
  const list = document.getElementById("issue-dropdown-list");
  if (!list) return;
  list.innerHTML = "";
  ISSUE_GROUPS.forEach(grp => {
    grp.issues.forEach(issue => {
      const opt = document.createElement("div");
      opt.className = "issue-option";
      opt.textContent = issue.label + " \u2013 " + issue.suffix;
      opt.dataset.code = issue.code;
      opt.addEventListener("click", () => selectIssue(issue, opt));
      list.appendChild(opt);
    });
  });
}

function openIssueDropdown() {
  const dd = document.getElementById("issue-dropdown");
  if (dd) dd.classList.remove("hidden");
  setTimeout(() => {
    const s = document.getElementById("issue-dropdown-search");
    if (s) s.focus();
  }, 50);
}

function filterIssues(query) {
  const q = query.toLowerCase();
  // only filter inside the issue dropdown, not the priority dropdown
  document.querySelectorAll("#issue-dropdown-list .issue-option").forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

/* ============================================================
   PRIORITY CUSTOM DROPDOWN
============================================================ */
function openPriorityDropdown() {
  const dd = document.getElementById("priority-dropdown");
  if (dd) dd.classList.remove("hidden");
}

function selectPriority(value, label) {
  state.tenantPriority = value;
  // Priority UI removed — elements may not exist, safe-guard with null checks
  const prioritySelect = document.getElementById("priority-select");
  const priorityDisplay = document.getElementById("priority-display");
  const priorityDropdown = document.getElementById("priority-dropdown");
  if (prioritySelect) prioritySelect.value = value;
  if (priorityDisplay) priorityDisplay.value = label;
  if (priorityDropdown) priorityDropdown.classList.add("hidden");

  document.querySelectorAll("#priority-dropdown-list .issue-option").forEach(el => {
    el.classList.toggle("selected", el.textContent.trim() === label.trim());
  });

  const errEl = document.getElementById("priority-select-error");
  if (errEl) errEl.textContent = "";
  const dispEl = document.getElementById("priority-display");
  if (dispEl) dispEl.classList.remove("error");
}

function selectIssue(issue, optEl) {
  state.selectedIssue = issue;

  document.querySelectorAll(".issue-option").forEach(el => el.classList.remove("selected"));
  if (optEl) optEl.classList.add("selected");

  document.getElementById("issue-search").value = issue.label + " \u2013 " + issue.suffix;
  document.getElementById("issue-code").value = issue.code;
  document.getElementById("issue-label").value = issue.label;

  const dd = document.getElementById("issue-dropdown");
  if (dd) dd.classList.add("hidden");

  const errEl = document.getElementById("issue-error");
  if (errEl) errEl.textContent = "";

  const urgentBanner = document.getElementById("urgent-banner");
  const emergencyBanner = document.getElementById("emergency-banner");
  if (urgentBanner) urgentBanner.classList.toggle("hidden", !issue.urgent);
  if (emergencyBanner) emergencyBanner.classList.toggle("hidden", !issue.emergency);

  const otherGroup = document.getElementById("other-issue-group");
  if (otherGroup) {
    if (issue.code === "RC-999G") {
      otherGroup.classList.remove("hidden");
      document.getElementById("other-issue").required = true;
    } else {
      otherGroup.classList.add("hidden");
      document.getElementById("other-issue").required = false;
      document.getElementById("other-issue").value = "";
    }
  }

  // Force troubleshoot rebuild next time
  state.tsBuiltForCode = null;
  state.ts = {};
  state.tsQA = [];
  state.internal = {
    engineer_required: false,
    request_closed: false,
    responsibility_type: "",
    priority: (issue.urgent || issue.emergency) ? "HIGH" : "normal",
    alert_type: "",
    troubleshooting_path: [],
    final_action: ""
  };
}

/* ============================================================
   FILE UPLOAD
============================================================ */
function setupDragDrop() {
  const area = document.getElementById("upload-area");
  if (!area) return;
  ["dragover", "dragenter"].forEach(ev => area.addEventListener(ev, e => {
    e.preventDefault(); area.style.borderColor = "var(--accent)";
  }));
  ["dragleave", "dragend"].forEach(ev => area.addEventListener(ev, () => {
    area.style.borderColor = "";
  }));
  area.addEventListener("drop", e => {
    e.preventDefault(); area.style.borderColor = "";
    handleFiles(e.dataTransfer.files);
  });
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (file.type.startsWith("image/") && file.type !== "image/gif") {
      compressImageFile(file)
        .then(compressed => {
          state.uploadedFiles.push(compressed);
          renderPreview(compressed);
        })
        .catch(() => {
          // Compression failed for some reason — still accept the original rather than losing the upload
          state.uploadedFiles.push(file);
          renderPreview(file);
        });
    } else {
      state.uploadedFiles.push(file);
      renderPreview(file);
    }
  });
}

// Downscale + re-encode large photos client-side before upload so a 12MP
// phone photo doesn't take minutes to send over a weak mobile connection.
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        resolve(new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", IMAGE_JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}

function renderPreview(file) {
  const wrap = document.getElementById("upload-previews");
  const item = document.createElement("div");
  item.className = "preview-item";
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    item.appendChild(img);
  } else if (file.type.startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    item.appendChild(vid);
  } else {
    const name = document.createElement("div");
    name.className = "preview-name";
    name.textContent = file.name;
    item.appendChild(name);
  }
  const btn = document.createElement("button");
  btn.className = "preview-remove"; btn.textContent = "\u2715"; btn.type = "button";
  btn.addEventListener("click", () => { state.uploadedFiles = state.uploadedFiles.filter(f => f !== file); item.remove(); });
  item.appendChild(btn);
  wrap.appendChild(item);
}

/* ============================================================
   ALERT MODAL
============================================================ */
function showModal(icon, title, message) {
  document.getElementById("modal-icon").textContent = icon;
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  document.getElementById("alert-modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("alert-modal").classList.add("hidden");
}

/* ============================================================
   VIDEO MODAL
============================================================ */
function openVideoModal(youtubeUrl) {
  // Convert YouTube watch URL to embed URL
  let embedUrl = youtubeUrl;
  const watchMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
  if (watchMatch) {
    embedUrl = "https://www.youtube.com/embed/" + watchMatch[1] + "?autoplay=1";
  }
  document.getElementById("video-iframe").src = embedUrl;
  document.getElementById("video-modal").classList.remove("hidden");
}

function closeVideoModal() {
  document.getElementById("video-modal").classList.add("hidden");
  // Stop video by clearing src
  const iframe = document.getElementById("video-iframe");
  if (iframe) iframe.src = "";
}

/* ============================================================
   TROUBLESHOOTING
============================================================ */
function buildTroubleshootSection() {
  const container = document.getElementById("troubleshoot-container");
  container.innerHTML = "";
  state.ts = {};
  state.tsQA = [];

  const issue = state.selectedIssue;
  if (!issue) {
    container.innerHTML = '<div class="no-troubleshoot"><div class="no-troubleshoot-icon">\u2705</div><p>No additional troubleshooting steps needed for this issue type. Please proceed to submit your report.</p></div>';
    return;
  }

  if (PEST_CODES.includes(issue.code)) {
    buildPestFlow(container);
  } else if (HEATING_CODES.includes(issue.code)) {
    buildHeatingFlow(container);
  } else if (ELECTRICAL_CODES.includes(issue.code)) {
    buildElectricalFlow(container);
  } else {
    container.innerHTML = '<div class="no-troubleshoot"><div class="no-troubleshoot-icon">\u2705</div><p>No additional troubleshooting steps needed for this issue type. Please proceed to submit your report.</p></div>';
  }
}

/* ---- Context-aware outcome messages ---- */
const RESOLVED_MSG = "\uD83C\uDF89 Great news! It looks like this issue has been resolved. Please still complete and submit this form so we have a record — if the problem returns we can act quickly.";
const ENGINEER_MSG = "\uD83D\uDD27 Based on your answers, it looks like an engineer visit may be needed. Please complete and submit your report below and our team will review and arrange a visit.";

function makeQuestion(id, text, options, helpLink) {
  const wrap = document.createElement("div");
  wrap.className = "ts-question";
  wrap.id = "ts-q-" + id;

  const q = document.createElement("div");
  q.className = "ts-question-text";
  q.textContent = text;
  wrap.appendChild(q);

  if (helpLink) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ts-help-link";
    btn.textContent = "\u25b6 " + helpLink.label;
    btn.addEventListener("click", () => openVideoModal(helpLink.url));
    wrap.appendChild(btn);
  }

  const optWrap = document.createElement("div");
  optWrap.className = "ts-options";

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ts-option-btn";
    btn.textContent = opt.label;
    btn.dataset.value = opt.value;

    btn.addEventListener("click", () => {
      // Mark selection
      optWrap.querySelectorAll(".ts-option-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      // Store answer
      state.ts[id] = opt.value;

      // Deduplicate path — remove any previous entry for this question
      state.internal.troubleshooting_path = state.internal.troubleshooting_path.filter(p => !p.startsWith(id + ":"));
      state.internal.troubleshooting_path.push(id + ":" + opt.value);

      // Update Q&A log (replace if already answered this question)
      state.tsQA = state.tsQA.filter(entry => entry.qid !== id);
      state.tsQA.push({ qid: id, q: text, a: opt.label });

      // Remove any previously injected notices inside wrap
      wrap.querySelectorAll(".ts-notice, .ts-warning, .ts-engineer, .ts-resolved, .ts-high-priority, .ts-outcome-neutral, .ts-outcome-resolved, .ts-outcome-engineer").forEach(el => el.remove());

      // Remove questions after this one in the container
      removeAfter(wrap);

      // *** CRITICAL: Reset disposition flags on EVERY click ***
      // Only the final answered leaf should determine outcome.
      // Changing an answer must wipe the previous answer's flags.
      state.internal.engineer_required = false;
      state.internal.request_closed = false;
      state.internal.alert_type = "";
      // Restore base priority from issue type selection (don't reset HIGH from issue-level urgency)
      if (!state.selectedIssue || (!state.selectedIssue.urgent && !state.selectedIssue.emergency)) {
        state.internal.priority = "normal";
      }

      // Now apply flags from the CURRENT answer
      if (opt.responsibility) {
        state.internal.responsibility_type = opt.responsibility;
        setHiddenVal("responsibility_type", opt.responsibility);
      }
      if (opt.engineerInternal || opt.engineer) {
        state.internal.engineer_required = true;
        setHiddenVal("engineer_required", "true");
      }
      if (opt.closedInternal || opt.resolved) {
        state.internal.request_closed = true;
        setHiddenVal("request_closed", "true");
      }
      if (opt.highAlert) {
        state.internal.priority = "HIGH";
        state.internal.engineer_required = true;
        setHiddenVal("priority", "HIGH");
        setHiddenVal("engineer_required", "true");
        // Safety alert IS shown to user
        appendNotice(wrap, opt.highAlert, "ts-high-priority");
      }

      // Show context-aware outcome message
      if (!opt.highAlert) {
        if (opt.resolved) {
          appendNotice(wrap, RESOLVED_MSG, "ts-outcome-resolved");
        } else if (opt.engineer) {
          appendNotice(wrap, ENGINEER_MSG, "ts-outcome-engineer");
        }
      }

      // Show responsibility warning modal if defined
      if (opt.modal && opt.modal.icon) {
        showModal(opt.modal.icon, opt.modal.title, opt.modal.message);
      }
      if (opt.modal) {
        state.internal.responsibility_type = state.internal.responsibility_type || "possible_tenant";
        setHiddenVal("responsibility_type", state.internal.responsibility_type);
      }

      // Continue to next question
      if (opt.next) opt.next();
    });

    optWrap.appendChild(btn);
  });

  wrap.appendChild(optWrap);
  return wrap;
}

function appendNotice(parent, text, cls) {
  const n = document.createElement("div");
  n.className = cls;
  n.textContent = text;
  parent.appendChild(n);
}

function removeAfter(el) {
  while (el.nextSibling) el.parentNode.removeChild(el.nextSibling);
}

function setHiddenVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

/* ============================================================
   PEST FLOW — mapped directly from issue code, no "what type?" Q
============================================================ */
function buildPestFlow(container) {
  const code = state.selectedIssue.code;
  // RC-160A = Rats/mice, RC-162A = Cockroaches, RC-163A = Bed bugs,
  // RC-164A = Insects/wasps, RC-165A = Rubbish/other pest
  if (code === "RC-160A") {
    buildRatsMiceFlow(container);
  } else if (code === "RC-162A" || code === "RC-163A") {
    buildRoachesBedbugsFlow(container);
  } else if (code === "RC-164A") {
    buildWaspsFlow(container);
  } else {
    buildOtherPestFlow(container);
  }
}

function buildRatsMiceFlow(container) {
  const q1 = makeQuestion("pest_holes", "Can you see any holes, gaps, or entry points in walls, floors, or around pipes?", [
    { label: "Yes", value: "yes", responsibility: "landlord" },
    {
      label: "No", value: "no", next: () => {
        const q2 = makeQuestion("pest_food", "Is there food left out, rubbish indoors, or pet food left overnight?", [
          { label: "Yes", value: "yes", modal: { icon: "⚠️", title: "Possible Tenant Responsibility", message: "Based on your answers, this issue may be your responsibility. You could be charged for the cost of treatment. The pest controller will confirm this on their visit. Please continue to submit your report." }, responsibility: "possible_tenant" },
          {
            label: "No", value: "no", next: () => {
              const q3 = makeQuestion("pest_preexisting", "Did you notice rodents when you first moved in?", [
                { label: "Yes", value: "yes", responsibility: "landlord" },
                { label: "No", value: "no", responsibility: "review_landlord_possible" },
              ]);
              container.appendChild(q3);
            }
          }
        ]);
        container.appendChild(q2);
      }
    }
  ]);
  container.appendChild(q1);
}

function buildRoachesBedbugsFlow(container) {
  const q1 = makeQuestion("pest_furniture", "Have you recently brought in second-hand furniture, luggage, or belongings?", [
    { label: "Yes", value: "yes", modal: { icon: "⚠️", title: "Possible Tenant Responsibility", message: "Based on your answers, this issue may be your responsibility. Bringing in second-hand items is a common cause of infestations. You could be charged for the cost of treatment. The pest controller will confirm this on their visit. Please continue to submit your report." }, responsibility: "possible_tenant" },
    {
      label: "No", value: "no", next: () => {
        const q2 = makeQuestion("pest_kitchen_clean", "Is the kitchen kept clean, with bins emptied regularly and crumbs cleared?", [
          {
            label: "Yes", value: "yes", next: () => {
              const q3 = makeQuestion("pest_preexisting_roach", "Did you notice pests when you first moved in?", [
                { label: "Yes", value: "yes", responsibility: "landlord" },
                { label: "No", value: "no", responsibility: "review_landlord_possible" },
              ]);
              container.appendChild(q3);
            }
          },
          { label: "No", value: "no", modal: { icon: "⚠️", title: "Possible Tenant Responsibility", message: "Based on your answers, this issue may be your responsibility. Poor hygiene conditions are a common cause of infestations. You could be charged for the cost of treatment. The pest controller will confirm this on their visit. Please continue to submit your report." }, responsibility: "possible_tenant" },
        ]);
        container.appendChild(q2);
      }
    }
  ]);
  container.appendChild(q1);
}

function buildWaspsFlow(container) {
  const q1 = makeQuestion("pest_wasps_location", "Is the nest located in the garden, loft, roof, eaves, or external walls?", [
    { label: "Yes", value: "yes", responsibility: "landlord" },
    { label: "No", value: "no", modal: { icon: "⚠️", title: "Possible Tenant Responsibility", message: "Based on your answers, if the nest is inside the property and not in an external structural area, this may be your responsibility. You could be charged for the cost of treatment. The pest controller will confirm this on their visit. Please continue to submit your report." }, responsibility: "possible_tenant" },
  ]);
  container.appendChild(q1);
}

function buildOtherPestFlow(container) {
  const q1 = makeQuestion("pest_other_location", "Where have you noticed them?", [
    { label: "Outside property", value: "outside", responsibility: "review_landlord_possible" },
    {
      label: "Inside property", value: "inside", next: () => {
        const q2 = makeQuestion("pest_other_preexisting", "Did you notice this problem when you first moved in?", [
          { label: "Yes", value: "yes", responsibility: "landlord" },
          { label: "No", value: "no", modal: { icon: "⚠️", title: "Possible Tenant Responsibility", message: "Based on your answers, this issue may be your responsibility as it does not appear to be a pre-existing or structural problem. You could be charged for the cost of treatment. The pest controller will confirm this on their visit. Please continue to submit your report." }, responsibility: "possible_tenant" },
        ]);
        container.appendChild(q2);
      }
    }
  ]);
  container.appendChild(q1);
}

/* ============================================================
   HEATING FLOW
============================================================ */
function buildHeatingFlow(container) {
  const q1 = makeQuestion("ht_gas", "Is your hot water and heating supplied by a gas boiler?", [
    { label: "Yes", value: "yes", next: () => buildGasBoilerFlow(container) },
    { label: "No", value: "no", next: () => buildNonGasFlow(container) },
  ]);
  container.appendChild(q1);
}

function buildGasBoilerFlow(container) {
  const q2 = makeQuestion("ht_meter", "Is your gas meter billed or a top-up / smart meter?", [
    { label: "Billed", value: "billed", next: () => buildHeatingQ3(container) },
    {
      label: "Top-up / Smart Meter", value: "topup", next: () => {
        const q2a = makeQuestion("ht_credit", "Have you checked there is enough credit on the meter?", [
          { label: "Yes, there is credit", value: "yes_credit", next: () => buildHeatingQ3(container) },
          { label: "No — the credit had finished, but I\u2019ve topped it up and heating & hot water are now working", value: "topped_resolved", resolved: true }
        ]);
        container.appendChild(q2a);
      }
    }
  ]);
  container.appendChild(q2);
}

function buildHeatingQ3(container) {
  const q3 = makeQuestion("ht_heating_now", "Do you currently have heating?", [
    { label: "Yes", value: "yes", next: () => buildHeatingQ4(container, "yes") },
    { label: "No", value: "no", next: () => buildHeatingQ4(container, "no") },
  ]);
  container.appendChild(q3);
}

function buildHeatingQ4(container, heatingStatus) {
  const q4 = makeQuestion("ht_hotwater_now", "Do you currently have hot water?", [
    {
      label: "Yes", value: "yes", next: () => {
        if (heatingStatus === "no") buildHeatingBothNoHotYes(container);
        else buildHeatingBothYes(container);
      }
    },
    {
      label: "No", value: "no", next: () => {
        if (heatingStatus === "no") buildHeatingBothNo(container);
        else buildHeatingHeatYesHWNo(container);
      }
    },
  ]);
  container.appendChild(q4);
}

function buildHeatingBothNo(container) {
  const q5 = makeQuestion(
    "ht_pressure",
    "Have you checked that the boiler is pressurised?",
    [
      { label: "Yes, it\u2019s correctly pressurised", value: "pressurised", engineer: true },
      {
        label: "No, I\u2019ve now re-pressurised it", value: "repressurised", next: () => {
          const qFix = makeQuestion("ht_pressure_fixed", "Did re-pressurising fix the issue?", [
            { label: "Yes", value: "yes", resolved: true },
            { label: "No", value: "no", engineer: true },
          ]);
          container.appendChild(qFix);
        }
      },
    ],
    { label: "How to Re-Pressurise Your Boiler", url: "https://youtu.be/I3HgvV2mIqY?si=Wuk_UPaR_3rSx3v1" }
  );
  container.appendChild(q5);
}

function buildHeatingBothNoHotYes(container) {
  const q6 = makeQuestion("ht_radiators_working", "Are your radiators working?", [
    { label: "Yes, radiators working", value: "yes", engineer: true },
    {
      label: "No, radiators not working", value: "no", next: () => {
        const q6b = makeQuestion(
          "ht_bleed",
          "Have you tried bleeding the affected radiators?",
          [
            { label: "Yes, I tried and it worked", value: "worked", resolved: true },
            { label: "Yes, I tried but it didn\u2019t work", value: "tried_failed", engineer: true },
            { label: "No, I haven\u2019t tried yet", value: "no", engineer: true },
          ],
          { label: "How to Bleed a Radiator", url: "https://youtu.be/0IP54Kbgnv0?si=H5UeWyFTQLNp0PbD" }
        );
        container.appendChild(q6b);
      }
    }
  ]);
  container.appendChild(q6);
}

function buildHeatingHeatYesHWNo(container) {
  const wrap = document.createElement("div");
  wrap.className = "ts-question";
  const txt = document.createElement("div");
  txt.className = "ts-question-text";
  txt.textContent = "Heating is working but there is no hot water.";
  wrap.appendChild(txt);
  appendNotice(wrap, ENGINEER_MSG, "ts-outcome-engineer");
  state.internal.engineer_required = true;
  setHiddenVal("engineer_required", "true");
  const input = document.createElement("input");
  input.type = "text"; input.className = "ts-text-input";
  input.placeholder = "Enter any boiler error codes here (optional)";
  input.id = "boiler_error_code";
  input.addEventListener("input", () => { state.ts["boiler_error_code"] = input.value; });
  wrap.appendChild(input);
  container.appendChild(wrap);
}

function buildHeatingBothYes(container) {
  const wrap = document.createElement("div");
  wrap.className = "ts-question";
  appendNotice(wrap, RESOLVED_MSG, "ts-outcome-resolved");
  container.appendChild(wrap);
}

function buildNonGasFlow(container) {
  const q7 = makeQuestion("ht_electric_boiler", "Is your heating/hot water supplied by an electric boiler or other system?", [
    {
      label: "Yes (Electric Boiler)", value: "electric", next: () => {
        const q8 = makeQuestion("ht_electric_prepaid", "Is your electric meter pre-paid?", [
          {
            label: "Yes (Pre-Paid)", value: "prepaid", next: () => {
              const qCredit = makeQuestion("ht_electric_credit", "Is there credit on your electric meter?", [
                { label: "Yes", value: "yes", engineer: true },
                { label: "No", value: "no", resolved: true },
              ]);
              container.appendChild(qCredit);
            }
          },
          { label: "No (Billed)", value: "billed", engineer: true },
        ]);
        container.appendChild(q8);
      }
    },
    { label: "No", value: "no", engineer: true },
  ]);
  container.appendChild(q7);
}

/* ============================================================
   ELECTRICAL FLOW
============================================================ */
function buildElectricalFlow(container) {
  const q1 = makeQuestion("el_whole_loss", "Do you have a loss of power in the whole property?", [
    { label: "Yes", value: "yes", next: () => buildElecQ2(container) },
    { label: "No", value: "no", next: () => buildElecQ4(container) },
  ]);
  container.appendChild(q1);
}

function buildElecQ2(container) {
  const q2 = makeQuestion("el_neighbour", "Have you checked if your neighbours also have no power?", [
    { label: "Yes, they also have no power", value: "yes", resolved: true },
    { label: "No, only my property", value: "no", next: () => buildElecQ3(container) },
  ]);
  container.appendChild(q2);
}

function buildElecQ3(container) {
  const q3 = makeQuestion("el_meter_type", "Is your electricity supplied through a billed account or a top-up meter?", [
    { label: "Billed", value: "billed", next: () => buildElecQ4(container) },
    {
      label: "Top-up", value: "topup", next: () => {
        const q3a = makeQuestion("el_credit", "Have you checked that there is credit on your meter?", [
          { label: "Yes", value: "yes", next: () => buildElecQ4(container) },
          {
            label: "No", value: "no", next: () => {
              const qTopUp = makeQuestion("el_topped", "Did topping up restore power?", [
                { label: "Yes", value: "yes", resolved: true },
                { label: "No", value: "no", next: () => buildElecQ4(container) },
              ]);
              container.appendChild(qTopUp);
            }
          },
        ]);
        container.appendChild(q3a);
      }
    },
  ]);
  container.appendChild(q3);
}

function buildElecQ4(container) {
  const q4 = makeQuestion("el_scope", "Is the power outage affecting all rooms or only specific rooms / outlets?", [
    { label: "All rooms", value: "all", next: () => buildElecQ5(container) },
    { label: "Specific rooms/outlets", value: "specific", next: () => buildElecQ6(container) },
  ]);
  container.appendChild(q4);
}

function buildElecQ5(container) {
  const q5 = makeQuestion("el_breaker", "Have you checked your main breaker / fuse box?", [
    {
      label: "Yes, the breaker is tripped / off", value: "tripped", next: () => {
        const qReset = makeQuestion("el_breaker_fixed", "Did resetting the breaker solve the issue?", [
          { label: "Yes", value: "yes", resolved: true },
          { label: "No", value: "no", next: () => buildElecQ7(container) },
        ]);
        container.appendChild(qReset);
      }
    },
    { label: "Yes, all breakers appear normal", value: "normal", next: () => buildElecQ7(container) },
    { label: "No, I haven\u2019t checked", value: "unchecked", next: () => buildElecQ7(container) },
  ]);
  container.appendChild(q5);
}

function buildElecQ6(container) {
  const q6 = makeQuestion("el_appliance", "Are the affected outlets linked to a specific appliance (e.g. kettle, heater, microwave)?", [
    {
      label: "Yes", value: "yes", next: () => {
        const qFixed = makeQuestion("el_appliance_fixed", "Did unplugging the appliance and testing the outlet solve the issue?", [
          { label: "Yes", value: "yes", resolved: true },
          { label: "No", value: "no", next: () => buildElecQ7(container) },
        ]);
        container.appendChild(qFixed);
      }
    },
    { label: "No", value: "no", next: () => buildElecQ7(container) },
  ]);
  container.appendChild(q6);
}

function buildElecQ7(container) {
  const wrap = document.createElement("div");
  wrap.className = "ts-question";
  wrap.id = "ts-q-el_safety";

  const q = document.createElement("div");
  q.className = "ts-question-text";
  q.textContent = "Do you notice any of the following? Select all that apply:";
  wrap.appendChild(q);

  const safetyOptions = [
    { id: "el_burning", label: "Burning smell" },
    { id: "el_sparks", label: "Sparks or smoke" },
    { id: "el_wiring", label: "Exposed wiring" },
    { id: "el_water", label: "Water near electrical fittings" },
    { id: "el_none", label: "None of the above" },
  ];

  const checkWrap = document.createElement("div");
  checkWrap.className = "ts-options";

  safetyOptions.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "ts-option-btn";
    btn.textContent = opt.label; btn.dataset.id = opt.id;
    btn.addEventListener("click", () => {
      if (opt.id === "el_none") {
        checkWrap.querySelectorAll(".ts-option-btn").forEach(b => b.classList.remove("selected"));
      } else {
        const noneBtn = checkWrap.querySelector("[data-id='el_none']");
        if (noneBtn) noneBtn.classList.remove("selected");
      }
      btn.classList.toggle("selected");
      evalElecSafety(wrap, checkWrap);
    });
    checkWrap.appendChild(btn);
  });

  wrap.appendChild(checkWrap);
  container.appendChild(wrap);
}

function evalElecSafety(parent, checkWrap) {
  parent.querySelectorAll(".ts-high-priority, .ts-engineer, .ts-outcome-neutral").forEach(el => el.remove());
  const selected = Array.from(checkWrap.querySelectorAll(".ts-option-btn.selected")).map(b => b.dataset.id);
  const danger = ["el_burning", "el_sparks", "el_wiring", "el_water"];
  const hasDanger = selected.some(id => danger.includes(id));

  state.ts["el_safety"] = selected.join(", ");
  state.tsQA = state.tsQA.filter(e => e.qid !== "el_safety");
  state.tsQA.push({ qid: "el_safety", q: "Electrical safety concerns", a: selected.join(", ") || "None selected" });

  if (hasDanger) {
    appendNotice(parent, "This has been flagged as a potential safety concern. Please keep away from the affected area. Our team will treat this as a priority.", "ts-high-priority");
    state.internal.priority = "HIGH"; state.internal.engineer_required = true;
    setHiddenVal("priority", "HIGH"); setHiddenVal("engineer_required", "true"); setHiddenVal("alert_type", "electrical_safety");
  } else if (selected.includes("el_none") || selected.length > 0) {
    appendNotice(parent, ENGINEER_MSG, "ts-outcome-engineer");
    state.internal.engineer_required = true;
    setHiddenVal("engineer_required", "true");
  }
}

/* ============================================================
   REVIEW GRID
============================================================ */
function buildReviewGrid() {
  const grid = document.getElementById("review-grid");
  grid.innerHTML = "";

  function add(label, value, full) {
    const div = document.createElement("div");
    div.className = full ? "review-item full" : "review-item";
    div.innerHTML = '<div class="review-item-label">' + label + '</div><div class="review-item-value">' + (value || "\u2014") + '</div>';
    grid.appendChild(div);
  }

  add("Full Name", document.getElementById("name").value);
  add("Email", document.getElementById("email").value);
  add("Phone", document.getElementById("phone").value);
  add("Address", document.getElementById("full-address").value, true);
  add("Postcode", document.getElementById("postcode").value);
  add("Issue Type", state.selectedIssue ? state.selectedIssue.label + " (" + state.selectedIssue.code + ")" : "\u2014", true);
  // priority field removed from form — internal priority managed by issue type / troubleshooting
  add("Further Info", document.getElementById("further-info").value, true);

  if (state.selectedIssue && state.selectedIssue.code === "RC-999G") {
    add("Other Issue Detail", document.getElementById("other-issue").value, true);
  }

  add("Files Attached", state.uploadedFiles.length ? state.uploadedFiles.length + " file(s)" : "None");

  // Troubleshooting Q&A section
  if (state.tsQA && state.tsQA.length > 0) {
    const tsDiv = document.createElement("div");
    tsDiv.className = "review-item full";
    let html = '<div class="review-item-label">Troubleshooting Answers</div>';
    html += '<div class="ts-review-block">';
    state.tsQA.forEach((entry, i) => {
      if (i > 0) html += '<hr class="ts-review-separator">';
      html += '<div class="ts-review-q">' + escHtml(entry.q) + '</div>';
      html += '<div class="ts-review-a">\u2192 ' + escHtml(entry.a) + '</div>';
    });
    html += '</div>';
    tsDiv.innerHTML = html;
    grid.appendChild(tsDiv);
  }

  // Update hidden fields
  setHiddenVal("submitted_at", new Date().toISOString());
  setHiddenVal("priority", state.internal.priority || "normal");
}

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ============================================================
   SUBMISSION
============================================================ */
async function handleSubmit(e) {
  e.preventDefault();
  if (!validateStep(1)) {
    goToStep(1);
    return;
  }
  if (!validateStep(2)) {
    goToStep(2);
    return;
  }
  if (!validateStep(4)) return;

  const submitBtn    = document.getElementById('submit-btn');
  const submitText   = document.getElementById('submit-text');
  const submitSpinner = document.getElementById('submit-spinner');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressLabel = document.getElementById('upload-progress-label');

  submitBtn.disabled = true;
  submitText.classList.add('hidden');
  submitSpinner.classList.remove('hidden');
  if (progressWrap) progressWrap.classList.remove('hidden');

  function updateProgress(pct, label) {
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLabel) {
      progressLabel.textContent = label || (pct >= 100 ? 'Processing…' : 'Uploading… ' + pct + '%');
    }
  }
  updateProgress(0, 'Preparing…');

  // ── 1. Upload files to Supabase Storage ─────────────────────────────
  // Files go directly from the browser to Supabase — they never pass
  // through submit.php or Make.com, so the 413 "too large" error is gone.
  let fileUrls = [];
  if (state.uploadedFiles.length > 0) {
    try {
      fileUrls = await uploadFilesToSupabase(state.uploadedFiles, updateProgress);
    } catch (uploadErr) {
      // File upload to Supabase failed — log it and continue without
      // the attachments rather than blocking the whole submission.
      console.error('[EHG] Supabase file upload error:', uploadErr.message);
    }
  }

  updateProgress(90, 'Submitting report…');

  const boilerErr = document.getElementById('boiler_error_code');
  const tsSummary = state.tsQA.map((entry, i) =>
    (i + 1) + '. ' + entry.q + '\n   Answer: ' + entry.a
  ).join('\n\n');

  const payload = {
    company_name:           'Emergency Housing Group',
    company:                'Emergency Housing Group',
    brand:                  'Emergency Housing Group',
    source:                 'Emergency Housing Group Maintenance Portal',
    name:                   document.getElementById('name').value.trim(),
    email:                  document.getElementById('email').value.trim(),
    phone:                  document.getElementById('phone').value.trim(),
    full_address:           document.getElementById('full-address').value,
    address_line_1:         document.getElementById('address-line1').value,
    address_line_2:         document.getElementById('address-line2').value,
    address_line_3:         document.getElementById('address-line3').value,
    city:                   document.getElementById('city').value,
    postcode:               document.getElementById('postcode').value,
    issue_label:            state.selectedIssue ? state.selectedIssue.label : '',
    issue_code:             state.selectedIssue ? state.selectedIssue.code  : '',
    other_issue_text:       document.getElementById('other-issue').value.trim(),
    further_info:           document.getElementById('further-info').value.trim(),
    internal_priority:      state.internal.priority,
    engineer_required:      state.internal.engineer_required,
    request_closed:         state.internal.request_closed,
    responsibility_type:    state.internal.responsibility_type,
    alert_type:             state.internal.alert_type,
    troubleshooting_path:   state.internal.troubleshooting_path,
    troubleshooting_answers: state.ts,
    troubleshooting_summary: tsSummary,
    boiler_error_code:      boilerErr ? boilerErr.value : '',
    // Files — Supabase public URLs (not binary data)
    file_urls:              fileUrls,
    uploaded_files_count:   fileUrls.length,
    uploaded_file_names:    state.uploadedFiles.map(f => f.name),
    submitted_at:           new Date().toISOString(),
    final_action: state.internal.engineer_required  ? 'engineer_required'
      : state.internal.request_closed               ? 'self_resolved'
      : state.internal.responsibility_type          ? 'responsibility_review'
      : 'standard_review'
  };

  // ── 2. Save to localStorage as backup ───────────────────────────────
  try {
    localStorage.setItem('ehg_pending_submission', JSON.stringify({
      payload,
      savedAt: new Date().toISOString(),
      fileNames: state.uploadedFiles.map(f => f.name)
    }));
  } catch (_) { /* localStorage unavailable — continue anyway */ }

  // ── 3. Send JSON to submit.php (no binary files) ─────────────────────
  const sent = await sendWithRetry(payload, updateProgress);

  submitBtn.disabled = false;
  submitText.classList.remove('hidden');
  submitSpinner.classList.add('hidden');
  if (progressWrap) progressWrap.classList.add('hidden');

  if (sent) {
    try {
      localStorage.removeItem('ehg_pending_submission');
      localStorage.removeItem('aslm_pending_submission');
    } catch (_) { }
    showConfirmation(payload);
  } else {
    showSubmissionError(payload);
  }
}

/* Retry helper — up to 3 attempts with 1.5 s / 3 s back-off.
   Sends JSON only — files have already been uploaded to Supabase Storage
   and only their public URLs are included in the payload, so there are
   no binary attachments and the Make.com 413 error cannot occur. */
function sendWithRetry(payload, onProgress) {
  const MAX = 3;
  return new Promise(resolve => {
    let attempt = 0;

    function tryOnce() {
      attempt++;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', WEBHOOK_URL);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve(true);
        } else if (xhr.status === 404 || xhr.status === 405) {
          // Direct fallback for pure static hosting without a PHP/Node relay
          try {
            const makeRes = await fetch('https://hook.eu1.make.com/ykaaofu4q8kbkrm91rr0fib67zoaz9me', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            try {
              const client = getSupabaseClient();
              await client.from('maintenance_submissions').insert([{
                name: payload.name,
                email: payload.email,
                phone: payload.phone,
                full_address: payload.full_address,
                issue_code: payload.issue_code,
                issue_label: payload.issue_label,
                further_info: payload.further_info,
                file_urls: payload.file_urls,
                file_count: payload.file_urls ? payload.file_urls.length : 0,
                submitted_at: payload.submitted_at
              }]);
            } catch (_) {}

            if (makeRes.ok) {
              if (onProgress) onProgress(100);
              resolve(true);
              return;
            }
          } catch (fallbackErr) {
            console.warn('[EHG] Static direct delivery fallback failed:', fallbackErr);
          }
          scheduleRetry();
        } else {
          scheduleRetry();
        }
      };
      xhr.onerror = scheduleRetry;
      xhr.send(JSON.stringify(payload));
    }

    function scheduleRetry() {
      if (attempt < MAX) {
        setTimeout(tryOnce, attempt * 1500); // 1.5 s → 3 s
      } else {
        resolve(false);
      }
    }

    tryOnce();
  });
}

/* Error screen shown when all retries fail */
function showSubmissionError(payload) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById("step-" + i);
    if (el) el.style.display = "none";
  }
  const step5 = document.getElementById("step-5");
  if (step5) step5.style.display = "block";

  const iconEl = document.getElementById("confirm-icon");
  const titleEl = document.getElementById("confirm-title");
  const msgEl = document.getElementById("confirm-message");
  const noteEl = document.getElementById("confirm-note");

  if (iconEl) iconEl.textContent = "⚠️";
  if (titleEl) titleEl.textContent = "Submission Failed";
  if (msgEl) msgEl.textContent =
    "We couldn't reach our server right now. Your details have been saved on this device. " +
    "Please try again, or email us directly using the link below — your data is NOT lost.";

  if (noteEl) {
    noteEl.className = "confirm-note confirm-note--warn";
    const subject = encodeURIComponent("Maintenance Report – " + payload.name);
    const body = encodeURIComponent(
      "Name: " + payload.name + "\n" +
      "Email: " + payload.email + "\n" +
      "Phone: " + payload.phone + "\n" +
      "Address: " + payload.full_address + "\n" +
      "Issue: " + payload.issue_label + "\n" +
      "Details: " + payload.further_info + "\n" +
      "Submitted: " + payload.submitted_at
    );
    noteEl.innerHTML =
      "<strong>Your report details are saved in this browser.</strong><br><br>" +
      "📧 <a href=\"mailto:ali@getmanagedtoday.com?subject=" + subject + "&body=" + body + "\" " +
      "style=\"color:#fcd34d;font-weight:700;\">Send report by email instead</a><br><br>" +
      "<button onclick=\"retrySubmission()\" " +
      "style=\"background:none;border:1.5px solid #fcd34d;color:#fcd34d;padding:0.35rem 1rem;" +
      "border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;\">🔄 Try Again</button>";
  }
}

/* Retry — takes user back to the Review step so they can resubmit */
function retrySubmission() {
  const step5 = document.getElementById("step-5");
  if (step5) step5.style.display = "none";
  _showStep(4);
  buildReviewGrid();
}


function showConfirmation(payload) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById("step-" + i);
    if (el) el.style.display = "none";
  }
  const step5 = document.getElementById("step-5");
  if (step5) step5.style.display = "block";

  // Extract first name for personalisation
  const firstName = (payload.name || "").split(" ")[0] || "there";

  // Dynamic icon, title, message — engineer_required ALWAYS overrides request_closed
  let icon, title, msg;

  if (payload.engineer_required) {
    // Engineer needed — don't show "resolved" regardless of request_closed
    icon = "✅";
    title = "Report Submitted, " + firstName + "!";
    msg = "Thank you for submitting your repair report. Based on the information provided, our maintenance team will review the details and arrange an engineer visit. Please keep an eye on your email or phone for updates.";
  } else if (payload.request_closed) {
    icon = "🎉";
    title = "Great News, " + firstName + "!";
    msg = "It looks like your issue may have been resolved through the troubleshooting steps. We've logged your report for our records — if the problem returns or wasn't fully resolved, please don't hesitate to get back in touch.";
  } else {
    icon = "✅";
    title = "Report Submitted, " + firstName + "!";
    msg = "Thank you for submitting your repair report. Our maintenance team will review the details and be in touch with you shortly to arrange next steps. Please keep an eye on your email or phone for updates.";
  }

  // Set icon, title, message
  const iconEl = document.getElementById("confirm-icon");
  const titleEl = document.getElementById("confirm-title");
  const msgEl = document.getElementById("confirm-message");
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;

  // Responsibility note
  const noteEl = document.getElementById("confirm-note");
  if (noteEl) {
    noteEl.textContent = "";
    noteEl.className = "confirm-note";
    if (payload.responsibility_type === "possible_tenant") {
      noteEl.textContent = "⚠️ Please note: Based on your answers, this issue may be your responsibility. A member of our team will review this and confirm with you before any charges are raised.";
      noteEl.classList.add("confirm-note--warn");
    } else if (payload.responsibility_type === "landlord") {
      noteEl.textContent = "🏠 This has been recorded as a potential landlord responsibility. Our team will review and confirm next steps.";
      noteEl.classList.add("confirm-note--info");
    }
  }

  // Hide reference number (removed per request)
  const refEl = document.getElementById("confirm-ref");
  if (refEl) refEl.style.display = "none";

  state.currentStep = 5;
  window.scrollTo({ top: 0, behavior: "smooth" });

}

function resetForm() {
  state = {
    currentStep: 1,
    addressConfirmed: false,
    selectedIssue: null,
    tenantPriority: "",
    uploadedFiles: [],
    ts: {},
    tsQA: [],
    tsBuiltForCode: null,
    hasTroubleshoot: true,
    internal: {
      engineer_required: false, request_closed: false,
      responsibility_type: "", priority: "normal",
      alert_type: "", troubleshooting_path: [], final_action: ""
    }
  };
  document.getElementById("repair-form").reset();
  const previews = document.getElementById("upload-previews");
  if (previews) previews.innerHTML = "";
  const addrSelected = document.getElementById("address-selected");
  if (addrSelected) addrSelected.classList.add("hidden");
  const urgentBanner = document.getElementById("urgent-banner");
  if (urgentBanner) urgentBanner.classList.add("hidden");
  const emergencyBanner = document.getElementById("emergency-banner");
  if (emergencyBanner) emergencyBanner.classList.add("hidden");
  const otherGroup = document.getElementById("other-issue-group");
  if (otherGroup) otherGroup.classList.add("hidden");
  buildIssueDropdown();

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("step-" + i);
    if (el) el.style.display = (i === 1) ? "block" : "none";
  }
  updateStepIndicators(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
