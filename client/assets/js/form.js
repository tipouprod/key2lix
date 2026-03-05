function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function t(key) {
  return (window.Key2lixLang && window.Key2lixLang.get(key)) || key;
}

function generateOrderID(length) {
  length = length || 6;
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var id = '';
  for (var i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'ORD-' + id;
}

var formProduct = document.getElementById("form-product");
var formValue = document.getElementById("form-value");
var nameInput = document.getElementById("customer-name");
var phoneInput = document.getElementById("customer-phone");
var emailInput = document.getElementById("customer-email");
var addressInput = document.getElementById("customer-address");
var orderForm = document.getElementById("order-form");

var productFromURL = getQueryParam("product");
var valueFromURL = getQueryParam("value");
var productKeyFromURL = getQueryParam("product_key");
var categoryFromURL = getQueryParam("category");
var subcatFromURL = getQueryParam("subcat");
function safeDecode(s) {
  try {
    return s ? decodeURIComponent(s) : "";
  } catch (e) {
    return s || "";
  }
}
var productVal = productFromURL ? safeDecode(productFromURL) : (localStorage.getItem("productName") || "");
var valueVal = valueFromURL ? safeDecode(valueFromURL) : (localStorage.getItem("productValue") || "");

formProduct.value = productVal;
formValue.value = valueVal;
// حفظ product_key, category, subcat من الرابط في حقول مخفية حتى لا تضيع عند الإرسال
var formProductKey = document.getElementById("form-product-key");
var formCategory = document.getElementById("form-category");
var formSubcat = document.getElementById("form-subcat");
if (formProductKey) formProductKey.value = productKeyFromURL ? safeDecode(productKeyFromURL) : "";
if (formCategory) formCategory.value = categoryFromURL ? safeDecode(categoryFromURL) : "";
if (formSubcat) formSubcat.value = subcatFromURL ? safeDecode(subcatFromURL) : "";

var giftModeEl = document.getElementById("gift-mode");
var giftFieldsEl = document.getElementById("gift-fields");
if (giftModeEl && giftFieldsEl) {
  giftModeEl.addEventListener("change", function () { giftFieldsEl.style.display = giftModeEl.checked ? "block" : "none"; });
}

// يجب أن يكون المستخدم مسجلاً لطلب منتج — إعادة توجيه لصفحة الدخول إن لم يكن مسجلاً
function redirectToLogin() {
  var returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = "/client-login?returnUrl=" + returnUrl;
}

// عدم السماح بتعديل بيانات الحساب في نموذج الطلب — الحقول للقراءة فقط عند المسجّل
function setOrderFormReadonly(readonly) {
  [nameInput, phoneInput, emailInput, addressInput].forEach(function (inp) {
    if (inp) inp.readOnly = !!readonly;
  });
  var editBtn = document.getElementById("btn-edit-order");
  if (editBtn) editBtn.style.display = readonly ? "none" : "";
  var hintEl = document.getElementById("form-data-from-account");
  if (hintEl) hintEl.style.display = readonly ? "block" : "none";
}

var GUEST_STORAGE_KEY = "key2lix_guest_contact";

function loadGuestFromStorage() {
  try {
    var raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return;
    var data = JSON.parse(raw);
    if (nameInput && data.name) nameInput.value = data.name;
    if (phoneInput && data.phone) phoneInput.value = data.phone;
    if (emailInput && data.email) emailInput.value = data.email;
    if (addressInput && data.address) addressInput.value = data.address;
  } catch (e) {}
}

function saveGuestToStorage(name, phone, email, address) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ name: name || "", phone: phone || "", email: email || "", address: address || "" }));
  } catch (e) {}
}

// عند طلب منتج يجب أن يكون المستخدم مسجلاً: إذا فتح صفحة الطلب بمنتج وقيمة وهو غير مسجّل → توجيه فوري لتسجيل الدخول
var hasOrderParams = !!(productFromURL || valueFromURL || productVal || valueVal);
// P3: تعبئة فورية من localStorage للضيف — قبل انتظار API
if (!hasOrderParams) { loadGuestFromStorage(); }
fetch("/api/client/me", { credentials: "same-origin" })
  .then(function (r) { return r.json(); })
  .then(function (client) {
    if (!client || !client.loggedIn) {
      if (hasOrderParams) { redirectToLogin(); return; }
      loadGuestFromStorage();
      return;
    }
    if (nameInput && client.name) nameInput.value = client.name;
    if (phoneInput && client.phone) phoneInput.value = client.phone;
    if (emailInput && client.email) emailInput.value = client.email;
    if (addressInput && client.address) addressInput.value = client.address;
    if ((!client.name && !client.phone && !client.email)) loadGuestFromStorage();
    else setOrderFormReadonly(true);
  })
  .catch(function () { if (!hasOrderParams) loadGuestFromStorage(); });

// P3: حفظ بيانات الضيف عند تغيير الحقول (blur) لتعبئة تلقائية لاحقة
function saveGuestOnBlur() {
  if (!nameInput || !phoneInput) return;
  saveGuestToStorage(
    nameInput.value ? nameInput.value.trim() : "",
    phoneInput.value ? phoneInput.value.trim() : "",
    emailInput && emailInput.value ? emailInput.value.trim() : "",
    addressInput && addressInput.value ? addressInput.value.trim() : ""
  );
}
if (nameInput) nameInput.addEventListener("blur", saveGuestOnBlur);
if (phoneInput) phoneInput.addEventListener("blur", saveGuestOnBlur);
if (emailInput) emailInput.addEventListener("blur", saveGuestOnBlur);
if (addressInput) addressInput.addEventListener("blur", saveGuestOnBlur);

// هل المبلغ منسّق مسبقاً بعملة (DZD/USD/EUR/د.ج)؟ إن كان كذلك لا نمرّره لـ formatPrice لأنه يعامل الرقم كدينار.
function amountAlreadyHasCurrency(amountStr) {
  if (!amountStr || typeof amountStr !== "string") return false;
  var t = amountStr.trim();
  return /\b(DZD|USD|EUR)\s*$/i.test(t) || /\u062f\.\u062c\s*$/.test(t) || /[\u0600-\u06FF]/.test(t);
}

// تنسيق القيمة للعرض: إذا كانت "تسمية - مبلغ" أو "تسمية - مبلغ DZD" نعرض التسمية والمبلغ منسّقاً
function formatValueForDisplay(val) {
  if (!val || String(val).trim() === "") return "—";
  var s = String(val).trim();
  var fmt = window.formatPriceDzd || function (n) { return n; };
  var sepMatch = s.match(/\s*-\s*/);
  if (sepMatch) {
    var idx = s.indexOf(sepMatch[0]);
    var optionLabel = s.substring(0, idx).trim();
    var amountStr = s.substring(idx + sepMatch[0].length).trim();
    var amountFormatted = amountAlreadyHasCurrency(amountStr) ? amountStr : (function () {
      var numStr = amountStr.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
      var num = parseFloat(numStr) || 0;
      return num ? fmt(num) : amountStr;
    })();
    return optionLabel ? (optionLabel + " — " + amountFormatted) : amountFormatted;
  }
  var num = parseFloat(s.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.]/g, ""));
  return !isNaN(num) && num > 0 ? fmt(num) : s;
}

// استخراج التسمية والقيمة للعرض في سطرين: label و value
function parseValueLabelAndValue(val) {
  var empty = { label: "—", value: "—" };
  if (!val || String(val).trim() === "") return empty;
  var s = String(val).trim();
  var fmt = window.formatPriceDzd || function (n) { return n; };
  var sepMatch = s.match(/\s*-\s*/);
  if (sepMatch) {
    var idx = s.indexOf(sepMatch[0]);
    var optionLabel = s.substring(0, idx).trim();
    var amountStr = s.substring(idx + sepMatch[0].length).trim();
    var amountFormatted = amountAlreadyHasCurrency(amountStr) ? amountStr : (function () {
      var numStr = amountStr.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
      var num = parseFloat(numStr) || 0;
      return num ? fmt(num) : amountStr;
    })();
    return { label: optionLabel || "—", value: amountFormatted };
  }
  var num = parseFloat(s.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.]/g, ""));
  return { label: "—", value: !isNaN(num) && num > 0 ? fmt(num) : s };
}

// عرض الخطوة 1: ملخص الطلب
var step1 = document.getElementById("form-step-1");
var step2 = document.getElementById("form-step-2");
var btnNext = document.getElementById("btn-next-step");
var ind1 = document.getElementById("step-indicator-1");
var ind2 = document.getElementById("step-indicator-2");

function setSummaryDisplay() {
  var summaryProduct = document.getElementById("summary-product");
  var summaryLabel = document.getElementById("summary-label");
  var summaryValue = document.getElementById("summary-value");
  if (summaryProduct) summaryProduct.textContent = formProduct.value || productVal || "—";
  var parsed = parseValueLabelAndValue(formValue.value || valueVal);
  if (summaryLabel) summaryLabel.textContent = parsed.label;
  if (summaryValue) summaryValue.textContent = parsed.value;
}

setSummaryDisplay();

// إذا القيمة وردت رقماً فقط أو المنتج/القيمة فارغان لكن لدينا product_key و category، جلب البيانات من API
var subcatFromURL = getQueryParam("subcat");
var needProductFromApi = productKeyFromURL && categoryFromURL && (
  !valueVal ||
  (!productVal && !formProduct.value) ||
  (valueVal.indexOf(" - ") === -1 && valueVal.indexOf("—") === -1)
);
if (needProductFromApi) {
  fetch("/data/products.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var cat = data[categoryFromURL];
      if (!cat || typeof cat !== "object") return;
      var product = null;
      if (categoryFromURL === "hardware" && subcatFromURL && cat[subcatFromURL]) {
        product = cat[subcatFromURL][productKeyFromURL] || null;
      } else if (cat[productKeyFromURL]) {
        product = cat[productKeyFromURL];
      }
      if (!product) return;
      if (product.name && (!productVal || !formProduct.value)) {
        productVal = product.name;
        formProduct.value = product.name;
      }
      // لا نستبدل القيمة إذا كانت واردة من الرابط (المستخدم اختار خياراً معيّناً)
      if (!valueFromURL && product.prices && product.prices[0]) {
        var p = product.prices[0];
        var fmt = window.formatPriceDzd || function (v) { return v; };
        var amount = (p.value != null && p.value !== "") ? (fmt(p.value) || p.value) : "";
        var correctValue = (p.label || "") + (amount ? " - " + amount : "");
        if (correctValue) {
          valueVal = correctValue;
          formValue.value = correctValue;
        }
      }
      setSummaryDisplay();
    })
    .catch(function () {});
}

function goToStep2() {
  step1.style.display = "none";
  step2.style.display = "block";
  if (ind1) ind1.classList.remove("active");
  if (ind2) ind2.classList.add("active");
}

var step3 = document.getElementById("form-step-3");
var ind3 = document.getElementById("step-indicator-3");
var btnEditOrder = document.getElementById("btn-edit-order");
var btnSubmitOrder = document.getElementById("btn-submit-order");
var confirmSummaryEl = document.getElementById("confirm-summary");

function goToStep3() {
  step2.style.display = "none";
  step3.style.display = "block";
  if (ind2) ind2.classList.remove("active");
  if (ind3) ind3.classList.add("active");
  var name = nameInput.value.trim();
  var phone = phoneInput.value.trim();
  var email = (emailInput.value || "").trim();
  var address = (addressInput.value || "").trim();
  saveGuestToStorage(name, phone, email, address);
  var product = formProduct.value;
  var value = formValue.value;
  var valueDisp = formatValueForDisplay(value);
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var row = function (label, val, priceRow) {
    var priceCls = priceRow ? " order-summary-price" : "";
    return "<div class=\"order-summary-row" + (priceRow ? " order-summary-price-row" : "") + "\"><span class=\"order-summary-label\">" + esc(label) + "</span><span class=\"order-summary-value" + priceCls + "\">" + esc(val || "—") + "</span></div>";
  };
  var couponEl = document.getElementById("customer-coupon");
  var couponCode = (couponEl && couponEl.value) ? couponEl.value.trim() : "";
  var parsed = parseValueLabelAndValue(value);
  var html =
    "<div class=\"order-summary-block order-summary-block-order\">" +
    row(t("labelProduct"), product) + row(t("labelLabel"), parsed.label) + row(t("labelValue"), parsed.value, true) +
    (couponCode ? row(t("couponCode"), couponCode) : "") +
    "</div><div class=\"order-summary-divider\" aria-hidden=\"true\"></div><div class=\"order-summary-block order-summary-block-contact\">" +
    row(t("labelName"), name) + row(t("labelPhone"), phone) + row(t("labelEmail"), email) + row(t("labelAddress"), address) +
    "</div>";
  if (confirmSummaryEl) confirmSummaryEl.innerHTML = html;
  var invoiceWrap = document.getElementById("invoice-preview-wrap");
  var invoicePreview = document.getElementById("invoice-preview");
  if (invoiceWrap && invoicePreview) {
    var lines = [
      "————————— Key2lix —————————",
      t("labelProduct") + ": " + (product || "—"),
      (parsed.label && parsed.label !== "—" ? parsed.label + " | " : "") + t("labelValue") + ": " + (parsed.value || "—"),
      (couponCode ? t("couponCode") + ": " + couponCode : ""),
      "—————————",
      t("labelName") + ": " + (name || "—"),
      t("labelPhone") + ": " + (phone || "—"),
      (email ? t("labelEmail") + ": " + email : ""),
      (address ? t("labelAddress") + ": " + address : ""),
      "—————————"
    ];
    invoicePreview.textContent = lines.filter(Boolean).join("\n");
    invoiceWrap.setAttribute("aria-hidden", "false");
  }
}

function goBackToStep2() {
  step3.style.display = "none";
  step2.style.display = "block";
  if (ind3) ind3.classList.remove("active");
  if (ind2) ind2.classList.add("active");
}

if (btnNext) {
  btnNext.addEventListener("click", function () {
    if (!productVal && !valueVal) {
      alert(t("enterProductValue"));
      return;
    }
    // يجب أن يكون المستخدم مسجلاً في الموقع لطلب منتج
    fetch("/api/client/me", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (client) {
        if (!client || !client.loggedIn) {
          var msg = t("orderLoginRequired") || "يجب تسجيل الدخول لطلب منتج.";
          if (window.Key2lixToast) window.Key2lixToast(msg, "error");
          else alert(msg);
          redirectToLogin();
          return;
        }
        if (client && (client.name || client.phone || client.email)) {
          if (nameInput && client.name) nameInput.value = client.name;
          if (phoneInput && client.phone) phoneInput.value = client.phone;
          if (emailInput && client.email) emailInput.value = client.email;
          if (addressInput && client.address) addressInput.value = client.address;
          setOrderFormReadonly(true);
        }
        goToStep2();
      })
      .catch(function () {});
  });
}

if (btnEditOrder) btnEditOrder.addEventListener("click", goBackToStep2);

document.getElementById("order-btn").addEventListener("click", function () {
  var name = nameInput.value.trim();
  var phone = phoneInput.value.trim();
  var email = (emailInput.value || "").trim();
  var address = (addressInput.value || "").trim();
  var product = formProduct.value;
  var value = formValue.value;

  if (!name) {
    alert(t("enterName"));
    return;
  }
  if (!phone) {
    alert(t("enterPhone"));
    return;
  }
  var phoneClean = phone.replace(/\s+/g, "").replace(/^\+213|^213|^0/, "");
  if (phoneClean.length < 9 || !/^\d+$/.test(phoneClean)) {
    alert(t("invalidPhone"));
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert(t("invalidEmail"));
    return;
  }
  goToStep3();
});

function doSubmitOrder() {
  // التأكد من أن المستخدم مسجّل قبل إرسال الطلب (شبكة أمان مع الخادم)
  fetch("/api/client/me", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.loggedIn) {
        var msg = t("orderLoginRequired") || "يجب تسجيل الدخول لطلب منتج.";
        if (window.Key2lixToast) window.Key2lixToast(msg, "error");
        else alert(msg);
        redirectToLogin();
        return;
      }
      doSubmitOrderSend();
    })
    .catch(function () {});
}

function doSubmitOrderSend() {
  var name = nameInput.value.trim();
  var phone = phoneInput.value.trim();
  var email = (emailInput.value || "").trim();
  var address = (addressInput.value || "").trim();
  var product = formProduct.value;
  var value = formValue.value;

  var submitBtn = document.getElementById("btn-submit-order");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = t("sending");
  }

  var orderId = generateOrderID();
  var productKey = (formProductKey && formProductKey.value) ? formProductKey.value.trim() : getQueryParam("product_key");
  var category = (formCategory && formCategory.value) ? formCategory.value.trim() : getQueryParam("category");
  var subcat = (formSubcat && formSubcat.value) ? formSubcat.value.trim() : (getQueryParam("subcat") || "");
  var couponEl = document.getElementById("customer-coupon");
  var couponCode = (couponEl && couponEl.value) ? couponEl.value.trim() : "";
  var payload = { orderId: orderId, product: product, value: value, name: name, phone: phone, email: email, address: address };
  if (productKey) payload.product_key = productKey;
  if (category) payload.category = category;
  if (subcat !== undefined) payload.subcat = subcat;
  if (couponCode) payload.coupon_code = couponCode;
  var giftModeCb = document.getElementById("gift-mode");
  if (giftModeCb && giftModeCb.checked) {
    payload.gift_mode = true;
    var giftRecipient = document.getElementById("gift-recipient-name");
    var giftMsg = document.getElementById("gift-message");
    var giftHidePriceCb = document.getElementById("gift-hide-price");
    if (giftRecipient) payload.gift_recipient_name = giftRecipient.value ? giftRecipient.value.trim() : "";
    if (giftMsg) payload.gift_message = giftMsg.value ? giftMsg.value.trim() : "";
    if (giftHidePriceCb) payload.gift_hide_price = giftHidePriceCb.checked;
  }

  fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include"
  })
    .then(function (r) {
      return r.json()
        .then(function (data) { return { ok: r.ok, status: r.status, data: data }; })
        .catch(function () { return { ok: false, status: r.status, data: {} }; });
    })
    .then(function (result) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("sendOrder");
      }
      if (!result.ok) {
        if (result.status === 401) {
          var loginMsg = t("orderLoginRequired") || "يجب تسجيل الدخول لطلب منتج.";
          if (window.Key2lixToast) window.Key2lixToast(loginMsg, "error");
          else alert(loginMsg);
          redirectToLogin();
          return;
        }
        if (result.status === 403 && result.data && (result.data.code === "email_verification_required" || (result.data.error && result.data.error.indexOf("تأكيد البريد") >= 0))) {
          var verifyMsg = (result.data.error || t("emailVerifyRequired") || "يجب تأكيد بريدك الإلكتروني قبل تنفيذ أي طلب.");
          if (window.Key2lixToast) window.Key2lixToast(verifyMsg, "error");
          else alert(verifyMsg);
          setTimeout(function () { window.location.href = "/client-account?verify=1"; }, 1200);
          return;
        }
        var msg = (result.data && (result.data.message || result.data.error)) ? (result.data.message || result.data.error) : (t("orderError") || "فشل إرسال الطلب. رمز: " + result.status);
        if (window.Key2lixToast) window.Key2lixToast(msg, "error");
        else alert(msg);
        return;
      }
      if (result.data && result.data.success) {
        var orderId = result.data.orderId || (payload && payload.orderId);
        if (window.Key2lixTrack) window.Key2lixTrack('purchase', { orderId: orderId, value: (formValue && formValue.value) || (payload && payload.value), product: (formProduct && formProduct.value) || (payload && payload.product) });
        var giftUrl = result.data.gift_redemption_url;
        if (giftUrl) {
          if (window.Key2lixToast) window.Key2lixToast(t("giftSuccessTitle") || "Gift link created!", "success");
          var msg = (t("giftSuccessCopy") || "Share this link:") + "\n" + giftUrl;
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(giftUrl).catch(function() {});
          alert(msg + "\n\n(Copied to clipboard if supported.)");
        } else if (window.Key2lixToast) window.Key2lixToast(t("orderSuccess") || "Order sent successfully!", "success");
        var go = orderId ? "/order-chat?order=" + encodeURIComponent(orderId) : "/client-account";
        setTimeout(function () { window.location.href = go; }, giftUrl ? 2500 : 1500);
      }
    })
    .catch(function (err) {
      console.error(err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("sendOrder");
      }
      var msg = t("orderNetworkError") || "خطأ في الاتصال. يرجى المحاولة لاحقاً.";
      if (window.Key2lixToast) window.Key2lixToast(msg, "error");
      else alert(msg);
    });
}

if (btnSubmitOrder) btnSubmitOrder.addEventListener("click", doSubmitOrder);
