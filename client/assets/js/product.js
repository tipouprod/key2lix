// ===== استرجاع بيانات المنتج من الرابط =====
function getQueryParam(param){
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// ===== عناصر الصفحة =====
const mainImg = document.getElementById("main-img");
const thumbs = document.getElementById("thumbs");
const nameEl = document.getElementById("product-name");
const descEl = document.getElementById("product-desc");
const priceSelect = document.getElementById("price-select");
const orderBtn = document.getElementById("order-btn");

// ===== الحصول على المنتج =====
const productKey = getQueryParam('product');

fetch('products.json')
  .then(res => res.json())
  .then(productsData => {
    const product = productsData[productKey];
    if(!product) {
      nameEl.textContent = "Product Not Found";
      return;
    }

    // عرض البيانات
    nameEl.textContent = product.name;
    descEl.textContent = product.desc;
    mainImg.src = product.images[0];

    // صور ثانوية
    thumbs.innerHTML = "";
    product.images.forEach(img => {
      const thumb = document.createElement("img");
      thumb.src = img;
      thumb.className = "thumb-img";
      thumb.addEventListener("click", () => mainImg.src = img);
      thumbs.appendChild(thumb);
    });

    // الأسعار
    priceSelect.innerHTML = "";
    var fmt = window.formatPriceDzd || function(v) { return v; };
    product.prices.forEach(price => {
      const option = document.createElement("option");
      option.value = `${price.label} - ${price.value}`;
      option.textContent = price.label + ' - ' + (price.value != null && price.value !== '' ? fmt(price.value) : price.value);
      priceSelect.appendChild(option);
    });

    // زر الطلب — نمرّر اسم المنتج في الرابط لظهوره صحيحاً في نموذج الطلب
    function updateOrderLink(){
      orderBtn.href = `form.html?product=${encodeURIComponent(product.name)}&value=${encodeURIComponent(priceSelect.value)}`;
      localStorage.setItem('productName', product.name);
      localStorage.setItem('productValue', priceSelect.value);
    }

    updateOrderLink();
    priceSelect.addEventListener('change', updateOrderLink);
  })
  .catch(err => console.error(err));
