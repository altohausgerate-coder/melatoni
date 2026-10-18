(() => {
  const client = window.MELATONI_SUPABASE;
  if (!client) return;

  const localProducts = Array.isArray(window.MELATONI_PRODUCTS) ? window.MELATONI_PRODUCTS : [];
  window.MELATONI_CATALOG_READY = false;
  const refresh = async () => {
    try {
      const { data, error } = await client.from('products').select('id,category,name,description,price,sale_price,image_url,material,stock_quantity,is_active').eq('is_active', true).order('created_at', { ascending: true });
      if (error || !Array.isArray(data)) return;
      const remoteProducts = data.map(row => ({
        id: row.id, category: row.category, name: row.name || {}, desc: row.description || {},
        price: Number(row.price), salePrice: row.sale_price == null ? undefined : Number(row.sale_price),
        image: row.image_url || '', material: row.material || {}, stock: row.stock_quantity
      }));
      const remoteIds = new Set(remoteProducts.map(product => product.id));
      const localAdditions = localProducts.filter(product => product.localOnly && !remoteIds.has(product.id));
      window.MELATONI_PRODUCTS = [...remoteProducts, ...localAdditions];
      window.MELATONI_CATALOG_READY = true;
      document.dispatchEvent(new CustomEvent('melatoni:catalog-updated', { detail: window.MELATONI_PRODUCTS }));
    } catch { /* Keep the bundled catalog available if Supabase is offline. */ }
  };
  refresh();
  client.channel('public-product-catalog').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh).subscribe();
})();
