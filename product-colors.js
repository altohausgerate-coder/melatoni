// Shared color options for catalog cards and product details. Availability is confirmed at order time.
window.MELATONI_PRODUCT_COLOR_KEYS={
  "pillow-cloud": [
    "white",
    "ivory",
    "sage",
    "blue"
  ],
  "pillow-balance": [
    "white",
    "sage"
  ],
  "pillow-down": [
    "cream",
    "sage"
  ],
  "pillow-side-cloud": [
    "ivory",
    "sage"
  ],
  "pillow-cool-rest": [
    "white",
    "blue"
  ],
  "pillow-support-high": [
    "white",
    "sage"
  ],
  "pillow-duo-rest": [
    "ivory",
    "sage"
  ],
  "linen-calm": [
    "ivory",
    "sand",
    "sage",
    "blue"
  ],
  "linen-percale": [
    "white",
    "blue"
  ],
  "linen-satin": [
    "ivory",
    "blush"
  ],
  "linen-tencel-touch": [
    "ivory",
    "sage"
  ],
  "linen-cotton-blend": [
    "white",
    "sand"
  ],
  "linen-winter-soft": [
    "ivory",
    "taupe"
  ],
  "linen-wedding-set": [
    "ivory",
    "blush"
  ],
  "linen-kids-dream": [
    "white",
    "blue"
  ],
  "pillowcase-pair-soft": [
    "ivory",
    "sage"
  ],
  "duvet-dream": [
    "ivory",
    "sage"
  ],
  "duvet-airy": [
    "white",
    "sand"
  ],
  "duvet-winter": [
    "ivory",
    "blue"
  ],
  "duvet-summer-light": [
    "white",
    "blue"
  ],
  "duvet-four-season": [
    "ivory",
    "sage"
  ],
  "protector-pure": [
    "white",
    "blue"
  ],
  "sheet-cloud": [
    "white",
    "ivory"
  ],
  "mattress-rest": [
    "white",
    "sand"
  ],
  "throw-knit": [
    "sand",
    "blue"
  ],
  "candle-night": [
    "ivory",
    "amber"
  ],
  "diffuser-calm": [
    "ivory",
    "sage"
  ],
  "mask-silk": [
    "ivory",
    "rose"
  ],
  "robe-soft": [
    "ivory",
    "blue"
  ],
  "pajama-cotton": [
    "ivory",
    "sage"
  ],
  "slippers-cloud": [
    "cream",
    "taupe"
  ],
  "towel-spa": [
    "white",
    "blue"
  ],
  "mini-star-pillow": [
    "ivory",
    "blue"
  ],
  "mini-moon-bedding": [
    "sage",
    "ivory"
  ],
  "mini-moon-pajamas": [
    "sage",
    "ivory"
  ],
  "gift-rest": [
    "ivory",
    "sage"
  ]
};
Object.assign(window.MELATONI_PRODUCT_COLOR_KEYS,Object.fromEntries((window.MELATONI_PRODUCTS||[]).filter(product=>product?.brand==='Mark Cross').map(product=>[product.id,['ivory','sand']])));
