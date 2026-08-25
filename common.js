/* =========================================================
   Click & Clean — Logika Bersama (dipakai index.html & admin.html)
   ========================================================= */

/* ============ GANTI SESUAI KEBUTUHAN USAHA ============ */
const ADMIN_PIN = "2024"; // PIN masuk panel admin/kasir — GANTI sebelum deploy ke publik
const SERVICES = [
  { id:'reguler', name:'Reguler', desc:'3 hari', pricePerKg:7000 },
  { id:'express', name:'Express', desc:'1 hari', pricePerKg:10000 },
  { id:'kilat',   name:'Kilat',   desc:'6 jam',  pricePerKg:15000 },
];
const PICKUP_FEE = 5000;
const USAGE_PER_KG = { detergen:20, pewangi:15 }; // ml per kg
const USAGE_PLASTIK = 1; // pcs per pesanan
const FULL_STOCK = { detergen:10000, pewangi:8000, plastik:1000 }; // kapasitas isi ulang
const STATUSES = ['Diterima','Diproses','Selesai','Diserahkan/Diambil'];
// Status khusus untuk permintaan jemput yang belum ditimbang petugas.
// Berat, harga, dan poin baru dihitung setelah kasir menimbang cucian.
const STATUS_AWAITING = 'Menunggu Penimbangan';
const PACKAGES = [
  { threshold:50, title:'Diskon Rp10.000', desc:'Potongan langsung untuk cucian berikutnya' },
  { threshold:100, title:'Gratis Cuci 3kg Reguler', desc:'Satu kali cuci gratis hingga 3kg' },
  { threshold:200, title:'Gratis Cuci 5kg Express', desc:'Satu kali cuci express gratis hingga 5kg' },
];
const PAYMENT_METHODS = [
  { id:'qris', label:'QRIS' },
  { id:'transfer', label:'Transfer Bank' },
  { id:'cash', label:'Tunai (Cash)' },
];

/* ============ UTIL ============ */
const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const fmtDate = iso => { try{ return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)); }catch(e){ return iso||'-'; } };
const serviceOf = id => SERVICES.find(s=>s.id===id) || SERVICES[0];
const paymentLabel = id => (PAYMENT_METHODS.find(p=>p.id===id)||{}).label || '-';

function trackingUrl(code){
  // index.html di folder yang sama dengan ?code=... akan otomatis membuka hasil lacak
  const base = location.origin + location.pathname.replace(/admin\.html$/,'index.html');
  return base + '?code=' + encodeURIComponent(code);
}
function waLink(order, statusMessage){
  let phone = (order.phone || '').replace(/[^0-9]/g,'');
  if(phone.startsWith('0')) phone = '62' + phone.slice(1);
  else if(!phone.startsWith('62')) phone = '62' + phone;
  const text = `Halo ${order.name}, status pesanan laundry Anda di *Click & Clean* (${order.code}): ${statusMessage}.\nLacak status real-time di: ${trackingUrl(order.code)}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/* ============ STATE ============ */
const state = {
  orders: [],
  stock: {...FULL_STOCK},
  redemptions: [],
  demoMode: false,   // true jika Firebase belum dikonfigurasi -> data tidak permanen & tidak dibagikan
  dataError: null,
};
const subscribers = [];
function onDataChange(cb){ subscribers.push(cb); }
function notify(){ subscribers.forEach(cb=>{ try{ cb(); }catch(e){ console.error(e); } }); }

/* ============ FIREBASE (opsional, untuk data nyata & real-time) ============ */
let db = null;
let USE_FIREBASE = false;

function initData(){
  const cfg = window.firebaseConfig;
  const configured = cfg && cfg.apiKey && !String(cfg.apiKey).includes('GANTI_DENGAN');
  if(configured && window.firebase){
    try{
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      USE_FIREBASE = true;

      db.collection('orders').orderBy('createdAtMs','desc')
        .onSnapshot(snap=>{
          state.orders = snap.docs.map(d=>({ id:d.id, ...d.data() }));
          notify();
        }, err=>{ console.error(err); state.dataError = 'Gagal memuat data pesanan dari server.'; notify(); });

      db.collection('meta').doc('stock').onSnapshot(doc=>{
        state.stock = doc.exists ? doc.data() : {...FULL_STOCK};
        if(!doc.exists) db.collection('meta').doc('stock').set({...FULL_STOCK}).catch(()=>{});
        notify();
      }, err=>{ console.error(err); });

      db.collection('redemptions').onSnapshot(snap=>{
        state.redemptions = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        notify();
      }, err=>{ console.error(err); });

    }catch(e){
      console.error('Firebase init gagal', e);
      state.demoMode = true;
      notify();
    }
  } else {
    // Mode demo: belum ada firebase-config.js terisi. Data hanya di sesi ini & TIDAK dibagikan antar perangkat.
    state.demoMode = true;
    notify();
  }
}

/* ============ LOGIKA BISNIS ============ */
function generateCode(){
  let code;
  do{ code = 'CC-' + Math.random().toString(36).slice(2,8).toUpperCase(); }
  while(state.orders.some(o=>o.code===code));
  return code;
}
function computeUsage(weight){
  return {
    detergen: Math.round(weight * USAGE_PER_KG.detergen),
    pewangi: Math.round(weight * USAGE_PER_KG.pewangi),
    plastik: USAGE_PLASTIK,
  };
}
function stockCanCover(usage){
  return state.stock.detergen - usage.detergen >= 0 &&
         state.stock.pewangi - usage.pewangi >= 0 &&
         state.stock.plastik - usage.plastik >= 0;
}
async function saveStock(next){
  state.stock = next;
  if(USE_FIREBASE) await db.collection('meta').doc('stock').set(next);
  else notify();
}
async function deductStock(usage){
  await saveStock({
    detergen: state.stock.detergen - usage.detergen,
    pewangi: state.stock.pewangi - usage.pewangi,
    plastik: state.stock.plastik - usage.plastik,
  });
}
function pointsFor(total){ return Math.floor(total/1000); }

async function createOrder({ name, phone, weight, serviceId, items, pickup, address, isPaid, paymentMethod, awaitingWeight }){
  const w = Number(weight) || 0;
  const svc = serviceOf(serviceId);
  const pending = !!awaitingWeight;

  // Pesanan yang belum ditimbang: harga, poin, dan pemakaian stok
  // sengaja BELUM dihitung karena penimbangan adalah wewenang kasir.
  let usage = null;
  if(!pending){
    usage = computeUsage(w);
    if(!stockCanCover(usage)){
      return { ok:false, error:'Stok bahan (deterjen/pewangi/plastik) tidak mencukupi untuk pesanan ini. Silakan isi ulang stok terlebih dahulu di tab Stok Otomatis.' };
    }
  }
  const total = pending ? 0 : Math.round(w * svc.pricePerKg) + (pickup ? PICKUP_FEE : 0);
  const paid = pending ? false : !!isPaid;
  const order = {
    code: generateCode(),
    name, phone, weight:w, serviceId, items: items||'',
    pickup: !!pickup, address: address||'',
    // 'jemput' = permintaan dari panel konsumen (dijemput petugas)
    // 'antar'  = pesanan input kasir yang minta diantar ke alamat pelanggan
    deliveryType: pickup ? (pending ? 'jemput' : 'antar') : null,
    awaitingWeight: pending,
    isPaid: paid,
    paymentMethod: paid ? (paymentMethod||'cash') : null,
    paidAt: paid ? new Date().toISOString() : null,
    status: pending ? STATUS_AWAITING : 'Diterima',
    totalPrice: total,
    pointsEarned: pending ? 0 : pointsFor(total),
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
  };
  if(USE_FIREBASE){
    const ref = await db.collection('orders').add(order);
    order.id = ref.id;
  } else {
    order.id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    state.orders.unshift(order);
  }
  if(usage) await deductStock(usage);
  notify();
  return { ok:true, order };
}

/* Kasir menimbang cucian jemputan -> baru di sini harga, poin, dan stok dihitung. */
async function applyWeight(id, weight){
  const o = state.orders.find(o=>o.id===id);
  if(!o) return { ok:false, error:'Pesanan tidak ditemukan.' };
  const w = Number(weight);
  if(!w || w <= 0) return { ok:false, error:'Berat harus lebih dari 0 kg.' };

  const usage = computeUsage(w);
  if(!stockCanCover(usage)){
    return { ok:false, error:'Stok bahan tidak mencukupi. Isi ulang stok dulu di tab Stok Otomatis.' };
  }
  const svc = serviceOf(o.serviceId);
  const total = Math.round(w * svc.pricePerKg) + (o.pickup ? PICKUP_FEE : 0);
  await updateOrder(id, {
    weight: w,
    totalPrice: total,
    pointsEarned: pointsFor(total),
    awaitingWeight: false,
    status: 'Diterima',
    weighedAt: new Date().toISOString(),
  });
  await deductStock(usage);
  return { ok:true, order: state.orders.find(o=>o.id===id) };
}

async function updateOrder(id, patch){
  const o = state.orders.find(o=>o.id===id);
  if(!o) return;
  Object.assign(o, patch);
  if(USE_FIREBASE) await db.collection('orders').doc(id).update(patch);
  notify();
}
async function setStatus(id, status){
  const o = state.orders.find(o=>o.id===id);
  if(!o) return;
  if(o.awaitingWeight) return; // belum ditimbang -> proses belum boleh berjalan
  if(status === 'Diserahkan/Diambil' && !o.isPaid) return; // system lock: tidak bisa diserahkan sebelum lunas
  await updateOrder(id, { status });
}
async function confirmPayment(id, method){
  const o = state.orders.find(o=>o.id===id);
  if(o && o.awaitingWeight) return; // tagihan belum ada sebelum ditimbang
  await updateOrder(id, { isPaid:true, paymentMethod: method, paidAt: new Date().toISOString() });
}
async function cancelPaymentConfirm(id){
  await updateOrder(id, { isPaid:false, paymentMethod:null, paidAt:null });
}
async function restock(item){
  await saveStock({ ...state.stock, [item]: FULL_STOCK[item] });
}
function pointsForPhone(phone){
  const earned = state.orders.filter(o=>o.phone===phone && o.isPaid).reduce((a,o)=>a+(o.pointsEarned||0),0);
  const redeemed = state.redemptions.filter(r=>r.phone===phone).reduce((a,r)=>a+(r.points||0),0);
  return earned - redeemed;
}
async function redeemPackage(phone, threshold){
  const pkg = PACKAGES.find(p=>p.threshold===threshold);
  if(pointsForPhone(phone) < threshold) return;
  const rec = { phone, points:threshold, package:pkg.title, at:new Date().toISOString() };
  if(USE_FIREBASE){
    const ref = await db.collection('redemptions').add(rec);
    rec.id = ref.id;
  } else {
    rec.id = 'local_' + Date.now();
    state.redemptions.push(rec);
  }
  notify();
}

/* ============ REKAP PENJUALAN ============ */
function inPeriod(iso, period){
  if(!iso) return false;
  const d = new Date(iso), now = new Date();
  if(period==='today') return d.toDateString()===now.toDateString();
  if(period==='week'){ const wa=new Date(now); wa.setDate(now.getDate()-7); return d>=wa; }
  if(period==='month') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  return true;
}
function computeRecap(period){
  const paid = state.orders.filter(o=>o.isPaid && inPeriod(o.paidAt, period));
  const omzet = paid.reduce((a,o)=>a+o.totalPrice,0);
  const jumlah = paid.length;
  const rata = jumlah ? Math.round(omzet/jumlah) : 0;
  const byService = SERVICES.map(s=>{
    const list = paid.filter(o=>o.serviceId===s.id);
    return { id:s.id, name:s.name, count:list.length, revenue:list.reduce((a,o)=>a+o.totalPrice,0) };
  });
  const byPayment = PAYMENT_METHODS.map(p=>{
    const list = paid.filter(o=>o.paymentMethod===p.id);
    return { id:p.id, name:p.label, count:list.length, revenue:list.reduce((a,o)=>a+o.totalPrice,0) };
  });
  return { omzet, jumlah, rata, byService, byPayment, maxServiceRevenue: Math.max(1,...byService.map(s=>s.revenue)), maxPaymentRevenue: Math.max(1,...byPayment.map(p=>p.revenue)) };
}
