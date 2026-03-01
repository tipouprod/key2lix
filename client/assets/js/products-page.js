const productsData = {
pubg: {
    name: "PUBG Mobile UC",
    desc: "Recharge PUBG Mobile UC instantly",
    images: ["img/pubg.png"],
    prices: [
      { label: "60 UC", value: "300 DZD" },
      { label: "325 UC", value: "1500 DZD" },
      { label: "660 UC", value: "3000 DZD" }
    ]
  },

  lol: {
    name: "League of Legends RP",
    desc: "Buy League of Legends RP safely",
    images: ["img/lol.png"],
    prices: [
      { label: "575 RP", value: "1400 DZD" },
      { label: "1380 RP", value: "3200 DZD" }
    ]
  },

  valorant: {
    name: "Valorant Points",
    desc: "Recharge Valorant VP fast",
    images: ["img/valorant.png"],
    prices: [
      { label: "475 VP", value: "1200 DZD" },
      { label: "1000 VP", value: "2300 DZD" }
    ]
  },

  apex: {
    name: "Apex Legends Coins",
    desc: "Buy Apex Coins instantly",
    images: ["img/apex.png"],
    prices: [
      { label: "1000 Coins", value: "2500 DZD" },
      { label: "2150 Coins", value: "4800 DZD" }
    ]
  },

  overwatch: {
    name: "Overwatch Coins",
    desc: "Recharge Overwatch Coins",
    images: ["img/overwatch.png"],
    prices: [
      { label: "500 Coins", value: "1500 DZD" },
      { label: "1000 Coins", value: "2900 DZD" }
    ]
  },

  genshin: {
    name: "Genshin Impact Crystals",
    desc: "Top up Genesis Crystals",
    images: ["img/genshin.png"],
    prices: [
      { label: "300 Crystals", value: "1200 DZD" },
      { label: "980 Crystals", value: "3600 DZD" }
    ]
  },

  fc26: {
    name: "FC 26 Points",
    desc: "Buy EA Sports FC 26 Points",
    images: ["img/fc26.png"],
    prices: [
      { label: "500 Points", value: "1500 DZD" },
      { label: "1050 Points", value: "2900 DZD" }
    ]
  },

  amongus: {
    name: "Among Us Stars",
    desc: "Among Us in-game currency",
    images: ["img/amongus.png"],
    prices: [
      { label: "100 Stars", value: "800 DZD" }
    ]
  },

  phasmophobia: {
    name: "Phasmophobia Credits",
    desc: "Phasmophobia game credits",
    images: ["img/phasmophobia.png"],
    prices: [
      { label: "Credits Pack", value: "1200 DZD" }
    ]
  },

  wow: {
    name: "World of Warcraft Gold",
    desc: "WoW Gold fast delivery",
    images: ["img/wow.png"],
    prices: [
      { label: "100k Gold", value: "2500 DZD" }
    ]
  },

  cs2: {
    name: "CS2 Balance",
    desc: "CS2 skins / balance recharge",
    images: ["img/cs2.png"],
    prices: [
      { label: "10$", value: "2400 DZD" }
    ]
  },

  fifa: {
    name: "FIFA Coins",
    desc: "FIFA Ultimate Team Coins",
    images: ["img/fifa.png"],
    prices: [
      { label: "100k Coins", value: "2600 DZD" }
    ]
  },

  tekken: {
    name: "Tekken Coins",
    desc: "Tekken in-game currency",
    images: ["img/tekken.png"],
    prices: [
      { label: "Coins Pack", value: "1500 DZD" }
    ]
  },

  minecraft: {
    name: "Minecraft Coins",
    desc: "Minecraft Marketplace Coins",
    images: ["img/minecraft.png"],
    prices: [
      { label: "1720 Coins", value: "2300 DZD" }
    ]
  },

  gta: {
    name: "GTA Online Shark Cards",
    desc: "GTA Online money cards",
    images: ["img/gta.png"],
    prices: [
      { label: "1.25M$", value: "3000 DZD" }
    ]
  },

  dota2: {
    name: "Dota 2 Shards",
    desc: "Dota 2 in-game currency",
    images: ["img/dota2.png"],
    prices: [
      { label: "Shards Pack", value: "1500 DZD" }
    ]
  },

  rust: {
    name: "Rust Skins / Balance",
    desc: "Rust in-game items",
    images: ["img/rust.png"],
    prices: [
      { label: "10$", value: "2400 DZD" }
    ]
  },

  steam: { name: "Steam", img: ["img/steam.png"], prices:[{value:"5$",price:"1200 DZD"}] },
  playstation: { name: "PlayStation", img: ["img/play.png"], prices:[{value:"10$",price:"2500 DZD"}] },
  googleplay: { name: "Google Play", img: ["img/google.png"], prices:[{value:"10$",price:"2300 DZD"}] }
};

const container = document.getElementById('products-container');
Object.keys(productsData).forEach(slug => {
  const p = productsData[slug];
  const div = document.createElement('div');
  div.className = "card";
  div.innerHTML = `
    <img src="${p.img[0]}" alt="${p.name}" class="prod-img">
    <h3>${p.name}</h3>
    <p>From ${p.prices[0].price}</p>
    <a href="product.html?product=${slug}" class="btn">View Product</a>
  `;
  container.appendChild(div);
});
