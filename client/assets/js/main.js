// ===== اللغة والعملة: الربط يتم في common.js (bindLangCurrencyDropdown) عند تحميل الـ navbar =====

// ===== تحميل المنتجات =====
fetch('products.json')
.then(res => res.json())
.then(productsData => {
  const container = document.getElementById('products-container');
  if(container){
    Object.keys(productsData).forEach(key=>{
      const p = productsData[key];
      const div = document.createElement('div');
      div.className = "card";
      div.innerHTML = `
        <div class="img-container">
          <img src="${p.images[0]}" alt="${p.name}" class="prod-img">
          <span class="badge hot">HOT</span>
        </div>
        <h3>${p.name}</h3>
        <p>From ${(window.formatPriceDzd && p.prices[0].value != null && p.prices[0].value !== '') ? window.formatPriceDzd(p.prices[0].value) : p.prices[0].value}</p>
        <a href="product.html?product=${key}" class="btn">View Product</a>
      `;
      container.appendChild(div);
    });
  }

  // ===== البحث =====
  const searchInput = document.getElementById('search');
  const searchResults = document.getElementById('search-results');
  if(searchInput){
    searchInput.addEventListener('input', ()=>{
      const query = searchInput.value.toLowerCase();
      searchResults.innerHTML = '';
      if(!query) return searchResults.style.display='none';

      Object.keys(productsData).forEach(key=>{
        const p = productsData[key];
        if(p.name.toLowerCase().includes(query)){
          const div = document.createElement('div');
          div.innerHTML = `<img src="${p.images[0]}" width="30" style="border-radius:5px;"> ${p.name}`;
          div.addEventListener('click', ()=> window.location.href=`product.html?product=${key}`);
          searchResults.appendChild(div);
        }
      });

      searchResults.style.display = searchResults.children.length ? 'block' : 'none';
    });
  }
})
.catch(err => console.error(err));
