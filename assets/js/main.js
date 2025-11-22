// VERİ YAPISI
let products = [];
let cityCoordinates = {};
let cityGeoJSON = null;
let map;
let productMarkers = [];
let filteredProducts = [];
let geoJsonLayer = null;
let selectedCity = null;
let isZoomedToCity = false;
let originalMapView = { center: [39.0, 35.0], zoom: 6 };
let currentSearchTerm = '';
let selectedProvince = '';
let selectedProductType = '';
let isRendering = false;
let shuffledProducts = [];

// BAĞLANTI ÇİZGİLERİ
let connectionLines = {}; // { productId: [path1, path2, ...] }
let svgLayer = null;
let animationFrameId = null;
let activeProductId = null;
let cardElements = {};
let linePaths = {};
let animationLoopRunning = false;
let lockedLocationId = null; // ✅ Marker'a tıklayınca lock - hover etkilemez

// Stil konstantları
const STYLES = {
    default: { opacity: 0.12, strokeWidth: 2 },
    hover: { opacity: 0.5, strokeWidth: 3 },
    active: { opacity: 0.8, strokeWidth: 4 }
};

// NEREDEN ALINIR? MODU
let whereToBuyMode = false;
let whereMap = null;
let storeMarkers = [];
let allStores = [];
let filteredStores = [];
let selectedProductsSnapshot = [];
let storesData = []; // stores.json'dan yüklenen gerçek satış yerleri
let sampleStores = []; // Filtrelenmiş satış yerleri

// Satış yeri filtre değişkenleri
let storeSearchTerm = '';
let selectedStoreProvince = '';
let selectedStoreType = '';

function updateWhereToBuyButtonVisibility() {
    const whereToBuyBtn = document.getElementById('whereToBuyBtnNew');
    console.log('🔍 updateWhereToBuyButtonVisibility çağrıldı:', {
        butonVar: !!whereToBuyBtn,
        selectedProvince,
        classList: whereToBuyBtn?.classList.toString()
    });
    
    if (!whereToBuyBtn) {
        console.error('❌ whereToBuyBtnNew butonu bulunamadı!');
        return;
    }
    
    if (selectedProvince && selectedProvince !== '') {
        whereToBuyBtn.classList.add('visible');
        console.log('✅ visible class eklendi, yeni classList:', whereToBuyBtn.classList.toString());
    } else {
        whereToBuyBtn.classList.remove('visible');
        console.log('❌ visible class kaldırıldı');
        if (whereToBuyMode) {
            exitWhereToBuyMode();
        }
    }
}

// Sayfa yüklenince verileri çek
window.onload = async () => {
    try {
        // SVG Layer'ı başlat
        svgLayer = document.getElementById('connection-lines-layer');
        
        await loadData();
        await loadCityGeoJSON();
        initMap();
        initFilters();
        displayProducts(filteredProducts);
        updateStats();
        
        // Bağlantı çizgilerini başlat
        initConnectionLines();
        
        // ✅ DÜZELTME: Animation başlatma - sadece event-based update
        // startConnectionAnimation(); // KALDIRILDI - Performance sorununa neden oluyor
    } catch (error) {
        console.error('Başlatma hatası:', error);
    }
};

// Verileri yükle
async function loadData() {
    try {
        const response = await fetch('data/products.json');
        const data = await response.json();
        products = data.products.filter(p => p.status !== "Başvuru");
        cityCoordinates = data.cityCoordinates;
        
        // ✅ GENİŞLETİLMİŞ DEBUG
        console.log('🔍 cityCoordinates:', typeof cityCoordinates, Object.keys(cityCoordinates || {}).length);
        console.log('🔍 İlk şehir anahtarı:', Object.keys(cityCoordinates)[0]);
        console.log('🔍 İlk şehir değeri:', cityCoordinates[Object.keys(cityCoordinates)[0]]);
        console.log('🔍 Değer tipi:', typeof cityCoordinates[Object.keys(cityCoordinates)[0]]);
        
        // SORUN 2: İlk yüklemede bir kere shuffle, sonra cache
        shuffledProducts = shuffleArray([...products]);
        filteredProducts = [...shuffledProducts];
        
        // stores.json'u yükle
        await loadStoresData();
    } catch (error) {
        console.error('Veri yüklenemedi:', error);
        const productsList = document.getElementById('productsList');
        if (productsList) {
            productsList.innerHTML = `
                <div class="empty-state">
                    <p>Veriler yüklenirken bir hata oluştu.</p>
                </div>
            `;
        }
    }
}

async function loadStoresData() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();
        storesData = data.stores || [];
        console.log(`✅ ${storesData.length} satış yeri yüklendi`);
    } catch (error) {
        console.error('Satış yerleri yüklenemedi:', error);
        storesData = [];
    }
}

async function loadCityGeoJSON() {
    try {
        const response = await fetch('data/cities.geojson');
        cityGeoJSON = await response.json();
    } catch (error) {
        console.error('GeoJSON yüklenemedi:', error);
    }
}

// SORUN 2: Shuffle sadece ilk yüklemede, sonra aynı sıra
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function updateStats() {
    const totalProductsEl = document.getElementById('totalProducts');
    const selectedCountEl = document.getElementById('selectedCount');
    
    if (totalProductsEl) {
        totalProductsEl.textContent = products.length.toLocaleString('tr-TR');
    }
    if (selectedCountEl) {
        selectedCountEl.textContent = filteredProducts.length.toLocaleString('tr-TR');
    }
}

let scrollTimeout;
window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const header = document.getElementById('mainHeader');
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }, 10);
});

function initMap() {
    map = L.map('map', {
        zoomControl: true,
        minZoom: 5,
        maxZoom: 18,
        boxZoom: false,
        doubleClickZoom: false,
        preferCanvas: true
    }).setView(originalMapView.center, originalMapView.zoom);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    if (cityGeoJSON) {
        geoJsonLayer = L.geoJSON(cityGeoJSON, {
            style: getDefaultStyle,
            onEachFeature: onEachFeature
        }).addTo(map);
    }

    map.on('click', function(e) {
        if (isZoomedToCity) {
            resetMapView();
        }
    });
}

function getDefaultStyle(feature) {
    return {
        fillColor: '#f0f0f0',
        weight: 1,
        opacity: 0.5,
        color: '#ccc',
        fillOpacity: 0.2
    };
}

function getHighlightStyle() {
    return {
        weight: 2,
        color: '#E30613',
        fillOpacity: 0.4,
        fillColor: '#FFE5E5'
    };
}

function getSelectedStyle() {
    return {
        weight: 3,
        color: '#E30613',
        fillOpacity: 0.15,
        fillColor: '#FFE5E5'
    };
}

function onEachFeature(feature, layer) {
    const cityName = feature.properties.name || feature.properties.NAME || feature.properties.il_adi;
    
    layer.on({
        mouseover: function(e) {
            if (!isZoomedToCity) {
                const layer = e.target;
                layer.setStyle(getHighlightStyle());
                
                layer.bindTooltip(cityName, {
                    permanent: false,
                    direction: 'center',
                    className: 'city-tooltip'
                }).openTooltip();
            }
        },
        mouseout: function(e) {
            if (!isZoomedToCity) {
                const layer = e.target;
                layer.setStyle(getDefaultStyle());
                layer.closeTooltip();
            }
        },
        click: function(e) {
            L.DomEvent.stopPropagation(e);
            
            if (isZoomedToCity && selectedCity !== cityName) {
                resetMapView();
                return;
            }
            
            zoomToCity(cityName, layer);
        }
    });
}

function zoomToCity(cityName, layer) {
    selectedCity = cityName;
    isZoomedToCity = true;
    selectedProvince = cityName; // İl seçimini güncelle
    updateWhereToBuyButtonVisibility();
    
    // ✅ İSTEK 1: Dropdown'da da ili seç
    const provinceSelect = document.getElementById('provinceFilter');
    if (provinceSelect) {
        provinceSelect.value = cityName;
    }
    
    // "Nereden Alınır?" butonunu göster
    const whereToBuyBtn = document.getElementById('whereToBuyBtnNew');
    if (whereToBuyBtn) {
        whereToBuyBtn.classList.add('visible');
    }
    
    if (geoJsonLayer) {
        geoJsonLayer.setStyle(getDefaultStyle);
    }
    
    layer.setStyle(getSelectedStyle());
    
    map.fitBounds(layer.getBounds(), {
        padding: [20, 20],
        animate: true,
        duration: 0.8,
        maxZoom: 12
    });
    
    setTimeout(() => {
        if (currentSearchTerm || selectedProductType) {
            // Arama terimi veya ürün türü varsa, şehir filtresini uygularken diğerlerini de koru
            const searchResults = products.filter(p => {
                const matchesCity = p.city === cityName;
                const matchesSearch = !currentSearchTerm || 
                    (p.name.toLowerCase().includes(currentSearchTerm) ||
                     p.category.toLowerCase().includes(currentSearchTerm));
                const matchesType = !selectedProductType || p.category === selectedProductType;
                return matchesCity && matchesSearch && matchesType;
            });
            filteredProducts = searchResults;
            
            let title = cityName;
            if (currentSearchTerm && selectedProductType) {
                title = `${cityName} - ${selectedProductType} - "${currentSearchTerm}"`;
            } else if (selectedProductType) {
                title = `${cityName} - ${selectedProductType}`;
            } else if (currentSearchTerm) {
                title = `${cityName} - "${currentSearchTerm}"`;
            }
            
            displayProducts(searchResults, title);
        } else {
            filterByCity(cityName);
        }
        showProductMarkersInPolygon(cityName, layer);
    }, 300);
}

function showProductMarkersInPolygon(cityName, layer) {
    clearProductMarkers();
    
    const cityProducts = filteredProducts.filter(p => p.city === cityName);
    
    if (cityProducts.length === 0) return;
    
    const limitedProducts = cityProducts.slice(0, 100);
    const bounds = layer.getBounds();
    
    // Poisson Disk Sampling ile homojen dağılım
    const positions = generatePoissonDiskSampling(layer, bounds, limitedProducts.length);
    
    let batchIndex = 0;
    const batchSize = 10;
    
    function renderBatch() {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, Math.min(limitedProducts.length, positions.length));
        
        for (let i = start; i < end; i++) {
            const product = limitedProducts[i];
            const position = positions[i];
            createProductMarker(product, position, i);
        }
        
        batchIndex++;
        
        if (end < Math.min(limitedProducts.length, positions.length)) {
            requestAnimationFrame(renderBatch);
        }
    }
    
    renderBatch();
}

// Poisson Disk Sampling algoritması - minimum mesafe garantili homojen dağılım
function generatePoissonDiskSampling(layer, bounds, numPoints) {
    const width = bounds.getEast() - bounds.getWest();
    const height = bounds.getNorth() - bounds.getSouth();
    
    // Minimum mesafe hesapla (polygon boyutuna göre adaptif)
    const area = width * height;
    const minDistance = Math.sqrt(area / numPoints) * 0.6;
    
    const cellSize = minDistance / Math.sqrt(2);
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = new Array(gridWidth * gridHeight).fill(null);
    
    const positions = [];
    const activeList = [];
    
    // İlk nokta - polygon merkezine yakın
    let firstPoint;
    let attempts = 0;
    do {
        const centerLat = bounds.getSouth() + height * 0.5;
        const centerLng = bounds.getWest() + width * 0.5;
        firstPoint = L.latLng(
            centerLat + (Math.random() - 0.5) * height * 0.2,
            centerLng + (Math.random() - 0.5) * width * 0.2
        );
        attempts++;
    } while (!isPointInPolygon(firstPoint, layer) && attempts < 50);
    
    if (isPointInPolygon(firstPoint, layer)) {
        positions.push(firstPoint);
        activeList.push(firstPoint);
        const gridX = Math.floor((firstPoint.lng - bounds.getWest()) / cellSize);
        const gridY = Math.floor((firstPoint.lat - bounds.getSouth()) / cellSize);
        grid[gridY * gridWidth + gridX] = firstPoint;
    }
    
    // Ana Poisson algoritması
    const k = 30; // Her nokta için deneme sayısı
    
    while (activeList.length > 0 && positions.length < numPoints) {
        const randomIndex = Math.floor(Math.random() * activeList.length);
        const point = activeList[randomIndex];
        let found = false;
        
        for (let i = 0; i < k; i++) {
            // Minimum mesafe ve 2*minDistance arasında random mesafede nokta üret
            const angle = Math.random() * 2 * Math.PI;
            const radius = minDistance * (1 + Math.random());
            
            const newLat = point.lat + radius * Math.sin(angle);
            const newLng = point.lng + radius * Math.cos(angle);
            const newPoint = L.latLng(newLat, newLng);
            
            // Sınırlar içinde mi?
            if (newLat < bounds.getSouth() || newLat > bounds.getNorth() ||
                newLng < bounds.getWest() || newLng > bounds.getEast()) {
                continue;
            }
            
            // Polygon içinde mi?
            if (!isPointInPolygon(newPoint, layer)) {
                continue;
            }
            
            // Grid'de yakın nokta var mı kontrol et
            const gridX = Math.floor((newLng - bounds.getWest()) / cellSize);
            const gridY = Math.floor((newLat - bounds.getSouth()) / cellSize);
            
            let tooClose = false;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const checkX = gridX + dx;
                    const checkY = gridY + dy;
                    
                    if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                        const neighbor = grid[checkY * gridWidth + checkX];
                        if (neighbor) {
                            const distance = Math.sqrt(
                                Math.pow(newLat - neighbor.lat, 2) + 
                                Math.pow(newLng - neighbor.lng, 2)
                            );
                            if (distance < minDistance) {
                                tooClose = true;
                                break;
                            }
                        }
                    }
                }
                if (tooClose) break;
            }
            
            if (!tooClose) {
                positions.push(newPoint);
                activeList.push(newPoint);
                grid[gridY * gridWidth + gridX] = newPoint;
                found = true;
                break;
            }
        }
        
        if (!found) {
            activeList.splice(randomIndex, 1);
        }
    }
    
    return positions;
}

function createProductMarker(product, position, index) {
    const delay = Math.min(index * 30, 1000);
    
    const iconHtml = product.imageUrl ? `
        <div class="product-marker" style="animation-delay: ${delay}ms">
            <img src="${product.imageUrl}" alt="${product.name}" onerror="this.src='assets/images/placeholder.jpg'">
        </div>
    ` : `
        <div class="product-marker product-marker-noimage" style="animation-delay: ${delay}ms">
            <span>📍</span>
        </div>
    `;
    
    const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-product-icon',
        iconSize: [65, 65],
        iconAnchor: [32.5, 32.5]
    });
    
    const marker = L.marker(position, { icon: icon }).addTo(map);
    
    marker.bindPopup(`
        <div class="product-popup">
            <strong>${product.name}</strong>
        </div>
    `, {
        autoPan: false,
        closeButton: false,
        className: 'minimal-popup'
    });
    
    marker.on('mouseover', function() {
        this.openPopup();
    });
    
    marker.on('mouseout', function() {
        this.closePopup();
    });
    
    marker.on('click', () => {
        showProductDetail(product.id);
    });
    
    productMarkers.push(marker);
}

function isPointInPolygon(point, layer) {
    const polygon = layer.toGeoJSON();
    let inside = false;
    
    if (polygon.geometry.type === 'Polygon') {
        inside = checkPointInPolygon(point, polygon.geometry.coordinates[0]);
    } else if (polygon.geometry.type === 'MultiPolygon') {
        for (let i = 0; i < polygon.geometry.coordinates.length; i++) {
            if (checkPointInPolygon(point, polygon.geometry.coordinates[i][0])) {
                inside = true;
                break;
            }
        }
    }
    
    return inside;
}

function checkPointInPolygon(point, vs) {
    const x = point.lng;
    const y = point.lat;
    let inside = false;
    
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) && 
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

function clearProductMarkers() {
    if (productMarkers.length > 0) {
        productMarkers.forEach(marker => map.removeLayer(marker));
        productMarkers = [];
    }
}

// SORUN 1: Reset fonksiyonu basitleştirildi
function resetMapView() {
    selectedProvince = '';
    updateWhereToBuyButtonVisibility();
    // Hızlı reset
    selectedCity = null;
    isZoomedToCity = false;
    
    // Marker'ları temizle
    clearProductMarkers();
    
    // Haritayı hızlıca resetle
    map.setView(originalMapView.center, originalMapView.zoom);
    
    if (geoJsonLayer) {
        geoJsonLayer.setStyle(getDefaultStyle);
    }
    
    // SORUN 1: applyFilters yerine direkt göster
    filteredProducts = [...shuffledProducts];
    displayProducts(filteredProducts, "Tüm Ürünler");
    updateStats();
}

function initFilters() {
    const provinceSelect = document.getElementById('provinceFilter');
    const uniqueCities = [...new Set(products.map(p => p.city))].sort();
    
    if (provinceSelect) {
        provinceSelect.innerHTML = '<option value="">Tüm İller</option>';
        uniqueCities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            provinceSelect.appendChild(option);
        });
    }
    
    const typeSelect = document.getElementById('productTypeFilter');
    const uniqueTypes = [...new Set(products.map(p => p.category))].sort();
    
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="">Tüm Türler</option>';
        uniqueTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });
    }
}

let filterTimeout;
function applyFilters() {
    if (filterTimeout) clearTimeout(filterTimeout);
    
    filterTimeout = setTimeout(() => {
        selectedProvince = document.getElementById('provinceFilter')?.value || '';
        selectedProductType = document.getElementById('productTypeFilter')?.value || '';
        currentSearchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
        
        // "Nereden Alınır?" butonunu göster/gizle
        const whereToBuyBtn = document.getElementById('whereToBuyBtnNew');
        console.log('🔍 Buton kontrolü:', {
            butonVar: !!whereToBuyBtn,
            selectedProvince,
            classList: whereToBuyBtn?.classList.toString()
        });
        
        if (whereToBuyBtn) {
            if (selectedProvince) {
                whereToBuyBtn.classList.add('visible');
                console.log('✅ Sağ buton visible class eklendi');
            } else {
                whereToBuyBtn.classList.remove('visible');
                console.log('❌ Sağ buton visible class kaldırıldı');
            }
        }
        
        // SORUN 2: shuffledProducts'tan filtrele, tekrar shuffle etme
        filteredProducts = shuffledProducts.filter(p => {
            const matchesSearch = !currentSearchTerm || 
                p.name.toLowerCase().includes(currentSearchTerm) ||
                p.city.toLowerCase().includes(currentSearchTerm) ||
                p.category.toLowerCase().includes(currentSearchTerm);
            
            const matchesProvince = !selectedProvince || p.city === selectedProvince;
            const matchesType = !selectedProductType || p.category === selectedProductType;
            
            return matchesSearch && matchesProvince && matchesType;
        });
        
        let title = "Tüm Ürünler";
        if (currentSearchTerm) title = `Arama: "${currentSearchTerm}"`;
        if (selectedProvince && selectedProductType) {
            // SORUN 1: Hem il hem tür seçiliyse her ikisini göster
            title = `${selectedProvince} - ${selectedProductType}`;
        } else if (selectedProvince) {
            title = selectedProvince;
        } else if (selectedProductType) {
            title = selectedProductType;
        }
        
        displayProducts(filteredProducts, title);
        updateWhereToBuyButtonVisibility();
        
        // SORUN 1: Hem il hem tür seçiliyse de ile zoom yap
        if (selectedProvince && geoJsonLayer) {
            geoJsonLayer.eachLayer(layer => {
                const cityName = layer.feature.properties.name || 
                               layer.feature.properties.NAME || 
                               layer.feature.properties.il_adi;
                if (cityName === selectedProvince) {
                    zoomToCity(cityName, layer);
                    return;
                }
            });
        } else if (!selectedProvince && selectedProductType) {
            // SORUN 1: Basit reset
            if (isZoomedToCity) {
                map.setView(originalMapView.center, originalMapView.zoom);
                if (geoJsonLayer) geoJsonLayer.setStyle(getDefaultStyle);
                isZoomedToCity = false;
                selectedCity = null;
            }
            showProductMarkersAllTurkey();
        } else if (currentSearchTerm && !selectedProvince) {
            // SORUN 1: Basit reset
            if (isZoomedToCity) {
                map.setView(originalMapView.center, originalMapView.zoom);
                if (geoJsonLayer) geoJsonLayer.setStyle(getDefaultStyle);
                isZoomedToCity = false;
                selectedCity = null;
            }
            showProductMarkersAllTurkey();
        } else {
            // SORUN 1: Tam reset gereksiz
            if (isZoomedToCity) {
                map.setView(originalMapView.center, originalMapView.zoom);
                if (geoJsonLayer) geoJsonLayer.setStyle(getDefaultStyle);
                isZoomedToCity = false;
                selectedCity = null;
            }
        }
        
        updateStats();
    }, 50); // 150ms'den 50ms'ye düşürüldü - daha responsive
}

function showProductMarkersAllTurkey() {
    clearProductMarkers();
    
    const limitedProducts = filteredProducts.slice(0, 50);
    
    limitedProducts.forEach((product, index) => {
        if (cityCoordinates[product.city]) {
            const coords = cityCoordinates[product.city];
            
            // ✅ Array formatını handle et
            let lat, lng;
            if (Array.isArray(coords) && coords.length === 2) {
                lat = coords[0];
                lng = coords[1];
            } else if (coords.lat && coords.lng) {
                lat = coords.lat;
                lng = coords.lng;
            } else {
                return; // Geçersiz format, atla
            }
            
            const position = L.latLng(lat, lng);
            
            const latOffset = (Math.random() - 0.5) * 0.1;
            const lngOffset = (Math.random() - 0.5) * 0.1;
            const adjustedPosition = L.latLng(
                position.lat + latOffset,
                position.lng + lngOffset
            );
            
            createProductMarker(product, adjustedPosition, index);
        }
    });
}

// SORUN 2: displayProducts basitleştirildi - shuffle yok
function displayProducts(productsToShow, title = "Tüm Ürünler") {
    if (isRendering) return;
    isRendering = true;
    
    const productsList = document.getElementById('productsList');
    const panelHeader = document.getElementById('panelHeader');
    
    if (!productsList || !panelHeader) {
        isRendering = false;
        return;
    }
    
    panelHeader.innerHTML = `${title} <span class="product-count">(${productsToShow.length.toLocaleString('tr-TR')} ürün)</span>`;
    updateStats();

    if (productsToShow.length === 0) {
        productsList.innerHTML = `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p>Ürün bulunamadı</p>
            </div>
        `;
        isRendering = false;
        return;
    }

    // Batch rendering optimize - daha büyük batch, daha az gecikme
    const fragment = document.createDocumentFragment();
    const batchSize = 100; // 50'den 100'e çıkarıldı - çok daha hızlı
    
    function renderBatch(start) {
        const end = Math.min(start + batchSize, productsToShow.length);
        
        for (let i = start; i < end; i++) {
            const product = productsToShow[i];
            const div = document.createElement('div');
            div.className = 'product-card';
            div.dataset.productId = product.id; // ✅ Bağlantı çizgileri için ID ekle
            
            // ✅ Nereden Alınır modunda modal açma - sadece çizgi vurgulama
            if (!whereToBuyMode) {
                div.onclick = () => showProductDetail(product.id);
            }
            
            div.innerHTML = `
                ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-image" onerror="this.style.display='none'">` : ''}
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-meta">
                        <span class="badge city">${product.city}</span>
                        <span class="badge type">${product.type}</span>
                        <span class="badge">${product.category}</span>
                    </div>
                </div>
            `;
            fragment.appendChild(div);
        }
        
        if (end >= productsToShow.length) {
            productsList.innerHTML = '';
            productsList.appendChild(fragment);
            isRendering = false;
        } else {
            setTimeout(() => renderBatch(end), 0); // requestAnimationFrame yerine setTimeout(0) - daha hızlı
        }
    }
    
    renderBatch(0);
}

function filterByCity(city) {
    // Şehir filtresini uygularken ürün türü filtresini de koru
    filteredProducts = shuffledProducts.filter(p => {
        const matchesCity = p.city === city;
        const matchesType = !selectedProductType || p.category === selectedProductType;
        return matchesCity && matchesType;
    });
    
    const title = selectedProductType ? `${city} - ${selectedProductType}` : city;
    displayProducts(filteredProducts, title);
    
    setTimeout(() => {
        const panel = document.querySelector('.products-panel');
        if (panel) {
            panel.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    }, 500);
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        currentSearchTerm = '';
    }
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    applyFilters();
}

// SORUN 3: Tüm filtreleri iptal et
function resetAllFilters() {
    // Arama alanını temizle
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        currentSearchTerm = '';
    }
    
    // Clear button'ı gizle
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    // Dropdown'ları resetle
    const provinceSelect = document.getElementById('provinceFilter');
    if (provinceSelect) {
        provinceSelect.value = '';
        selectedProvince = '';
    }
    
    const typeSelect = document.getElementById('productTypeFilter');
    if (typeSelect) {
        typeSelect.value = '';
        selectedProductType = '';
        updateWhereToBuyButtonVisibility();
    }
    
    // Haritayı resetle
    if (isZoomedToCity) {
        map.setView(originalMapView.center, originalMapView.zoom);
        if (geoJsonLayer) {
            geoJsonLayer.setStyle(getDefaultStyle);
        }
        isZoomedToCity = false;
        selectedCity = null;
    }
    
    // Marker'ları temizle
    clearProductMarkers();
    
    // Tüm ürünleri göster
    filteredProducts = [...shuffledProducts];
    displayProducts(filteredProducts, "Tüm Ürünler");
    updateStats();
}

let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = e.target.value ? 'flex' : 'none';
            }
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }
});

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const modalTitle = document.getElementById('modalTitle');
    const modalBadges = document.getElementById('modalBadges');
    const modalBody = document.getElementById('modalBody');
    
    if (!modalTitle || !modalBadges || !modalBody) return;

    modalTitle.textContent = product.name;
    modalBadges.innerHTML = `
        <div class="product-meta" style="margin-top: 15px;">
            <span class="badge city">${product.city}</span>
            <span class="badge type">${product.type}</span>
            <span class="badge">${product.category}</span>
        </div>
    `;

    modalBody.innerHTML = `
        ${product.imageUrl ? `
        <div class="modal-image-container">
            <img src="${product.imageUrl}" alt="${product.name}" class="modal-image"
                 onerror="this.parentElement.style.display='none'">
        </div>
        ` : ''}

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Tescil Tarihi</div>
                <div class="info-value">${product.registrationDate || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Durum</div>
                <div class="info-value">${product.status || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Başvuru Yapan</div>
                <div class="info-value">${product.applicant || '-'}</div>
            </div>
        </div>
        <div style="text-align: center;">
            <a href="${product.link}" target="_blank" class="action-button">
                🔗 Detaylı Bilgi Al
            </a>
        </div>
    `;

    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ✅ İSTEK 3: Store bilgilerini modal ile göster
function showStoreDetail(store) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBadges = document.getElementById('modalBadges');
    const modalBody = document.getElementById('modalBody');

    // Marker renk belirleme
    const isProductCity = store.city === store.productCity;
    const markerColor = isProductCity ? '#E30613' : '#28a745';
    const locationText = isProductCity ? '🏠 Ürünün ana ilinde' : '🏪 Diğer ilden satış';

    modalTitle.textContent = store.name;
    
    modalBadges.innerHTML = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
            <span class="badge" style="background: ${markerColor}; color: white;">${store.type}</span>
            <span class="badge city">${store.city} / ${store.district}</span>
        </div>
    `;

    modalBody.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Adres</div>
                <div class="info-value">${store.address}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Telefon</div>
                <div class="info-value"><a href="tel:${store.phone}" style="color: #E30613; text-decoration: none;">${store.phone}</a></div>
            </div>
            <div class="info-item">
                <div class="info-label">Çalışma Saatleri</div>
                <div class="info-value">${store.workingHours}</div>
            </div>
            ${store.rating ? `
            <div class="info-item">
                <div class="info-label">Değerlendirme</div>
                <div class="info-value">⭐ ${store.rating}/5.0</div>
            </div>
            ` : ''}
        </div>
        
        ${store.products && store.products.length > 0 ? `
        <div class="detail-section">
            <h3>Satılan Ürünler</h3>
            <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
                ${store.products.map(p => `<li>${p}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        <div style="background: ${markerColor}10; padding: 15px; border-radius: 10px; margin-top: 20px; text-align: center;">
            <p style="color: ${markerColor}; font-weight: 600; margin: 0;">${locationText}</p>
        </div>
        
        ${store.website ? `
        <div style="text-align: center; margin-top: 20px;">
            <a href="${store.website}" target="_blank" class="action-button">
                🌐 Web Sitesini Ziyaret Et
            </a>
        </div>
        ` : ''}
    `;

    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.add('active');
    }
}

const modal = document.getElementById('productModal');
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('productModal');
        if (modal && modal.classList.contains('active')) {
            closeModal();
        } else if (whereToBuyMode) {
            exitWhereToBuyMode();
        } else if (isZoomedToCity) {
            resetMapView();
        }
    }
});

// ========================================
// NEREDEN ALINIR? MODU FONKSİYONLARI
// ========================================

function toggleWhereToBuyMode(event) {
    if (event) event.preventDefault();
    
    if (!whereToBuyMode) {
        enterWhereToBuyMode();
    } else {
        exitWhereToBuyMode();
    }
}

function showProductsMode(event) {
    if (event) event.preventDefault();
    
    // Eğer where-to-buy modundaysak çık
    if (whereToBuyMode) {
        exitWhereToBuyMode();
    }
    
    // NOT: Filtreleri SIFIRLAMIYORUZ - kullanıcının seçimi korunsun
    // resetAllFilters(); // KALDIRILDI
}

function enterWhereToBuyMode() {
    // Önce filteredProducts kontrolü yap (selectedProductsSnapshot henüz set edilmemiş olabilir)
    if (!filteredProducts || filteredProducts.length === 0) {
        alert('Lütfen önce bir il seçin.');
        console.error('❌ filteredProducts boş');
        return;
    }
    
    console.log('✅ Kontrol geçti, filteredProducts:', filteredProducts.length);
    
    // Seçili ürünleri snapshot'a kaydet
    selectedProductsSnapshot = [...filteredProducts];
    
    // Seçili ürünlerin illerini al
    const selectedCities = [...new Set(selectedProductsSnapshot.map(p => p.city))];
    console.log('🏙️ Seçili iller:', selectedCities);
    
    // stores.json'dan kontrol et
    let hasStores = false;
    if (storesData && storesData.length > 0) {
        const matchingStores = storesData.filter(store => {
            return selectedCities.includes(store.city);
        });
        hasStores = matchingStores.length > 0;
        console.log('🏪 Bulunan satış noktası sayısı:', matchingStores.length);
    } else {
        console.warn('⚠️ storesData yüklenmemiş veya boş');
    }
    
    // Eğer satış noktası yoksa kullanıcıyı bilgilendir ve işlemi durdur
    if (!hasStores) {
        alert('Seçili ürünler için henüz satış noktası bilgisi bulunmamaktadır.');
        console.log('❌ Satış noktası bulunamadı. Seçili iller:', selectedCities);
        return;
    }
    
    console.log('✅ Satış noktası bulundu, moda geçiliyor...');
    
    whereToBuyMode = true;
    document.body.classList.add('where-to-buy-mode');
    
    // Filtreleri değiştir
    const normalFilters = document.getElementById('normalFilters');
    const storeFilters = document.getElementById('storeFilters');
    if (normalFilters) normalFilters.style.display = 'none';
    if (storeFilters) storeFilters.style.display = 'grid';
    
    // Haritayı başlat (eğer yoksa)
    if (!whereMap) {
        setTimeout(() => {
            initWhereMap(); // ✅ Bu fonksiyon artık GeoJSON'u da ekliyor
            loadStores();
            initStoreFilters();
        }, 100);
    } else {
        // ✅ Harita varsa ama GeoJSON yoksa, GeoJSON'u ekle
        whereMap.eachLayer(layer => {
            if (layer instanceof L.GeoJSON) {
                whereMap.removeLayer(layer);
            }
        });
        
        if (cityGeoJSON) {
            const whereGeoJsonLayer = L.geoJSON(cityGeoJSON, {
                style: getDefaultStyle,
                interactive: false
            }).addTo(whereMap);
            
            // ✅ GÜÇLÜ ÇÖZÜM: invalidateSize ve zoom
            setTimeout(() => {
                // İlk invalidateSize
                whereMap.invalidateSize(true);
                
                setTimeout(() => {
                    // İkinci invalidateSize
                    whereMap.invalidateSize(true);
                    
                    // Seçili ili bul ve zoom yap
                    if (selectedProvince) {
                        let targetLayer = null;
                        
                        whereGeoJsonLayer.eachLayer(layer => {
                            const cityName = layer.feature.properties.name || 
                                           layer.feature.properties.NAME || 
                                           layer.feature.properties.il_adi;
                            
                            if (cityName === selectedProvince) {
                                targetLayer = layer;
                                layer.setStyle({
                                    weight: 3,
                                    color: '#E30613',
                                    fillOpacity: 0.15,
                                    fillColor: '#FFE5E5'
                                });
                            }
                        });
                        
                        if (targetLayer) {
                            setTimeout(() => {
                                whereMap.fitBounds(targetLayer.getBounds(), {
                                    padding: [50, 50],
                                    animate: true,
                                    duration: 1.0,
                                    maxZoom: 10
                                });
                                
                                setTimeout(() => {
                                    whereMap.invalidateSize(true);
                                }, 100);
                            }, 200);
                        }
                    }
                }, 150);
            }, 300);
        }
        
        loadStores();
        
        // ✅ Çizgileri güncelle (bir kez)
        setTimeout(() => {
            updateConnectionLines();
        }, 1500); // Marker'lar eklendikten sonra
    }
}

function exitWhereToBuyMode() {
    whereToBuyMode = false;
    document.body.classList.remove('where-to-buy-mode');
    
    // Filtreleri geri al
    const normalFilters = document.getElementById('normalFilters');
    const storeFilters = document.getElementById('storeFilters');
    if (normalFilters) normalFilters.style.display = 'grid';
    if (storeFilters) storeFilters.style.display = 'none';
    
    // Marker'ları temizle
    clearStoreMarkers();
    
    // ✅ Bağlantı çizgilerini temizle ve gizle
    clearConnectionLines();
    if (svgLayer) {
        svgLayer.style.display = 'none';
    }
    
    // Satış yeri filtrelerini resetle
    resetStoreFilters();
    
    // Ürün listesini geri yükle (snapshot'tan)
    if (selectedProductsSnapshot.length > 0) {
        displayProducts(selectedProductsSnapshot);
    }
}

function initWhereMap() {
    whereMap = L.map('whereMap', {
        zoomControl: true,
        minZoom: 5,
        maxZoom: 18,
        preferCanvas: true
    }).setView([39.0, 35.0], 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(whereMap);
    
    // ✅ GeoJSON LAYER EKLE (İkinci haritaya da il sınırları)
    if (cityGeoJSON) {
        const whereGeoJsonLayer = L.geoJSON(cityGeoJSON, {
            style: getDefaultStyle,
            interactive: false // Tıklama kapalı, sadece görsel
        }).addTo(whereMap);
        
        // ✅ GÜÇLÜ ÇÖZÜM: Çoklu invalidateSize ve zoom
        setTimeout(() => {
            // İlk invalidateSize
            whereMap.invalidateSize(true);
            
            setTimeout(() => {
                // İkinci invalidateSize (emin olmak için)
                whereMap.invalidateSize(true);
                
                // Seçili ili bul ve zoom yap
                if (selectedProvince) {
                    let targetLayer = null;
                    
                    whereGeoJsonLayer.eachLayer(layer => {
                        const cityName = layer.feature.properties.name || 
                                       layer.feature.properties.NAME || 
                                       layer.feature.properties.il_adi;
                        
                        if (cityName === selectedProvince) {
                            targetLayer = layer;
                            // İli kırmızı yap
                            layer.setStyle({
                                weight: 3,
                                color: '#E30613',
                                fillOpacity: 0.15,
                                fillColor: '#FFE5E5'
                            });
                        }
                    });
                    
                    // Zoom işlemini son bir kez daha geciktir
                    if (targetLayer) {
                        setTimeout(() => {
                            whereMap.fitBounds(targetLayer.getBounds(), {
                                padding: [50, 50],
                                animate: true,
                                duration: 1.0,
                                maxZoom: 12
                            });
                            
                            // Zoom sonrası bir kez daha invalidateSize
                            setTimeout(() => {
                                whereMap.invalidateSize(true);
                            }, 100);
                        }, 200);
                    }
                }
            }, 150);
        }, 300);
    }
    
    // ✅ HARİTA EVENT LISTENER'LARI - Harita hareket ettiğinde çizgileri güncelle
    whereMap.on('move', () => {
        if (whereToBuyMode) {
            requestAnimationFrame(() => updateConnectionLines());
        }
    });
    
    // Zoom animasyonu sırasında sürekli güncelleme
    let zoomAnimationFrame = null;
    
    whereMap.on('zoomstart', () => {
        if (!whereToBuyMode) return;
        
        // Zoom animasyonu sırasında sürekli güncelle
        const updateDuringZoom = () => {
            updateConnectionLines();
            zoomAnimationFrame = requestAnimationFrame(updateDuringZoom);
        };
        updateDuringZoom();
    });
    
    whereMap.on('zoomend', () => {
        // Zoom bitince animasyonu durdur ve son bir güncelleme yap
        if (zoomAnimationFrame) {
            cancelAnimationFrame(zoomAnimationFrame);
            zoomAnimationFrame = null;
        }
        if (whereToBuyMode) {
            updateConnectionLines();
        }
    });
    
    whereMap.on('zoom', () => {
        if (whereToBuyMode) {
            requestAnimationFrame(() => updateConnectionLines());
        }
    });
    
    whereMap.on('drag', () => {
        if (whereToBuyMode) {
            requestAnimationFrame(() => updateConnectionLines());
        }
    });
    
    whereMap.on('moveend', () => {
        if (whereToBuyMode) {
            updateConnectionLines();
        }
    });
    
    // ✅ Haritaya tıklayınca (boş alana) lock'u kaldır
    whereMap.on('click', (e) => {
        // Eğer marker'a tıklanmadıysa (boş alana tıklandı)
        if (!e.originalEvent.target.closest('.store-marker') && 
            !e.originalEvent.target.closest('.leaflet-marker-icon')) {
            lockedLocationId = null;
            // Tüm çizgileri normale döndür
            Object.keys(linePaths).forEach(productId => {
                const connections = linePaths[productId];
                connections.forEach(conn => {
                    applyLineStyle(conn.path, STYLES.default);
                });
            });
        }
    });
    
    console.log('✅ Where map event listeners kuruldu');
}

function loadStores() {
    console.log('🔄 loadStores() başlatıldı');
    
    if (!selectedProductsSnapshot || selectedProductsSnapshot.length === 0) {
        console.error('❌ Seçili ürün yok!');
        alert('Hata: Seçili ürün bulunamadı. Lütfen önce bir il seçin.');
        return;
    }
    
    console.log(`✅ ${selectedProductsSnapshot.length} ürün seçili`);
    
    // cityCoordinates kontrolü
    if (!cityCoordinates || Object.keys(cityCoordinates).length === 0) {
        console.error('❌ cityCoordinates yüklenmemiş!');
        alert('Hata: Şehir koordinatları yüklenmedi. Lütfen sayfayı yenileyin.');
        return;
    }
    
    // ✅ İLK ŞEHİR YAPISINI KONTROL ET
    const firstCityKey = Object.keys(cityCoordinates)[0];
    const firstCityValue = cityCoordinates[firstCityKey];
    console.log('🔍 İlk şehir yapısı:', firstCityKey, firstCityValue);
    
    const storeTypes = ['Market', 'Pazar', 'Kooperatif', 'Mağaza', 'Toptancı', 'Restoran', 'Online'];
    
    // ✅ ESTETİK FİLTRELEME - FARKLI YAPILAR İÇİN
    const cities = Object.keys(cityCoordinates).filter(city => {
        const coords = cityCoordinates[city];
        
        // Durum 1: { lat: 41.0, lng: 28.9 }
        if (coords && typeof coords === 'object' && 
            typeof coords.lat === 'number' && typeof coords.lng === 'number') {
            return true;
        }
        
        // Durum 2: [41.0, 28.9] - Array format
        if (Array.isArray(coords) && coords.length === 2 && 
            typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            return true;
        }
        
        // Durum 3: { latitude: 41.0, longitude: 28.9 }
        if (coords && typeof coords === 'object' && 
            typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
            return true;
        }
        
        console.warn(`⚠️ Geçersiz koordinat formatı: ${city}`, coords);
        return false;
    });
    
    console.log(`✅ ${cities.length} geçerli şehir bulundu`);
    
    if (cities.length === 0) {
        console.error('❌ Geçerli şehir koordinatı yok!');
        console.log('🔍 cityCoordinates örnek:', cityCoordinates[Object.keys(cityCoordinates)[0]]);
        alert('Hata: Geçerli şehir koordinatı bulunamadı. Console\'u kontrol edin.');
        return;
    }
    
    sampleStores = [];
    
    // ÖNCELİKLE: stores.json'dan gerçek verileri kullanmayı dene
    if (storesData && storesData.length > 0) {
        const selectedCities = [...new Set(selectedProductsSnapshot.map(p => p.city))];
        const matchingStores = storesData.filter(store => {
            return selectedCities.includes(store.city);
        });
        
        if (matchingStores.length > 0) {
            console.log(`✅ stores.json'dan ${matchingStores.length} eşleşen satış yeri bulundu`);
            
            sampleStores = matchingStores.map(store => {
                const cityProducts = selectedProductsSnapshot
                    .filter(p => p.city === store.city)
                    .map(p => p.name);
                
                const firstProduct = selectedProductsSnapshot.find(p => p.city === store.city);
                
                return {
                    ...store,
                    products: cityProducts.length > 0 ? cityProducts : ['Çeşitli Ürünler'],
                    productCity: firstProduct ? firstProduct.city : store.city,
                    rating: store.rating || (Math.random() * 2 + 3).toFixed(1)
                };
            });
        }
    }
    
    // ✅ İSTEK 2: stores.json'dan veri yoksa hata ver, random oluşturma
    if (sampleStores.length === 0) {
        console.warn('⚠️ stores.json\'dan yeterli veri yok!');
        alert('Seçili ürünler için satış noktası bulunamadı. stores.json dosyasını genişletmeniz gerekiyor.');
        return;
    }
    
    console.log(`✅ ${sampleStores.length} satış noktası hazır`);
    
    filteredStores = [...sampleStores];
    
    if (sampleStores.length > 0) {
        showStoreMarkers();
    } else {
        alert('Satış noktası oluşturulamadı.');
    }
}

function showStoreMarkers() {
    clearStoreMarkers();
    clearConnectionLines(); // Eski çizgileri temizle
    
    if (!whereMap) {
        console.error('❌ whereMap henüz başlatılmamış!');
        return;
    }
    
    if (!filteredStores || filteredStores.length === 0) {
        console.warn('⚠️ Gösterilecek satış yeri yok');
        return;
    }
    
    console.log(`🗺️ ${filteredStores.length} satış noktası haritaya ekleniyor...`);
    
    // Ürün illerinin merkez koordinatları (arc'lar için)
    const productCityCenters = {};
    selectedProductsSnapshot.forEach(product => {
        if (product.city && cityCoordinates[product.city]) {
            const coords = cityCoordinates[product.city];
            if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
                productCityCenters[product.city] = coords;
            }
        }
    });
    
    let successCount = 0;
    let failCount = 0;
    
    filteredStores.forEach((store, index) => {
        // Koordinat kontrolü
        if (typeof store.lat !== 'number' || typeof store.lng !== 'number' || 
            isNaN(store.lat) || isNaN(store.lng)) {
            console.error(`❌ Geçersiz koordinat:`, store.name, store.lat, store.lng);
            failCount++;
            return;
        }
        
        const delay = index * 30;
        
        // Ürün ilindeyse kırmızı, başka ildeyse yeşil marker
        const isProductCity = store.city === store.productCity;
        const markerColor = isProductCity ? '#E30613' : '#28a745';
        const markerIcon = isProductCity ? '🏠' : '🏪';
        
        const storeIcon = L.divIcon({
            html: `
                <div class="store-marker" style="animation-delay: ${delay}ms; border-color: ${markerColor}">
                    ${markerIcon}
                </div>
            `,
            className: 'custom-store-icon',
            iconSize: [45, 45],
            iconAnchor: [22.5, 22.5]
        });
        
        try {
            const marker = L.marker([store.lat, store.lng], { icon: storeIcon }).addTo(whereMap);
            
            // ✅ LocationId ekle (interaksiyon için)
            marker._locationId = store.id;
            marker._storeData = store;
            
            // Arc çizgisi ekle (eğer başka ildeyse)
            if (!isProductCity && store.productCity && productCityCenters[store.productCity]) {
                const start = productCityCenters[store.productCity];
                const end = { lat: store.lat, lng: store.lng };
                
                const arcLine = L.polyline([
                    [start.lat, start.lng],
                    [end.lat, end.lng]
                ], {
                    color: markerColor,
                    weight: 2,
                    opacity: 0.4,
                    dashArray: '5, 10',
                    className: 'store-connection-line'
                }).addTo(whereMap);
                
                storeMarkers.push(arcLine);
            }
            
            // ✅ Ürün-Marker bağlantı çizgilerini oluştur
            if (store.products && store.products.length > 0) {
                store.products.forEach(productName => {
                    // Ürünü bul
                    const product = selectedProductsSnapshot.find(p => p.name === productName);
                    if (product) {
                        createConnectionLine(product, marker);
                    }
                });
            }
            
            // ✅ Click event - Marker'a tıklayınca ürünleri vurgula
            marker.on('click', function() {
                highlightLocationProducts(store.id, store);
                showStoreDetail(store);
            });
            
            storeMarkers.push(marker);
            successCount++;
            
        } catch (error) {
            console.error(`❌ Marker eklenirken hata:`, store.name, error);
            failCount++;
        }
    });
    
    console.log(`✅ ${successCount} marker eklendi, ${failCount} hata`);
    
    // ✅ Çizgileri güncelle (marker'lar eklendikten sonra)
    setTimeout(() => {
        console.log('🎨 Çizgiler güncelleniyor...');
        updateConnectionLines();
    }, 500);
    
    // ✅ DÜZELTME: Marker'lara zoom yapma, il zoom'u zaten yapılıyor
    // İl zoom'u initWhereMap ve enterWhereToBuyMode'da yapılıyor
}

function clearStoreMarkers() {
    if (storeMarkers.length > 0) {
        storeMarkers.forEach(marker => whereMap.removeLayer(marker));
        storeMarkers = [];
    }
    
    // ✅ Bağlantı çizgilerini de temizle
    clearConnectionLines();
}

// ========================================
// SATIŞ YERİ FİLTRELEME FONKSİYONLARI
// ========================================

function initStoreFilters() {
    // Satış yeri illerini doldur
    const storeProvinceSelect = document.getElementById('storeProvinceFilter');
    if (storeProvinceSelect) {
        const uniqueCities = [...new Set(sampleStores.map(s => s.city))].sort();
        storeProvinceSelect.innerHTML = '<option value="">Tüm İller</option>';
        uniqueCities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            storeProvinceSelect.appendChild(option);
        });
        
        // ✅ İSTEK 4: Seçili il varsa, dropdown'da da seç
        if (selectedProvince) {
            storeProvinceSelect.value = selectedProvince;
            selectedStoreProvince = selectedProvince;
        }
    }
    
    // Satış yeri türlerini doldur
    const storeTypeSelect = document.getElementById('storeTypeFilter');
    if (storeTypeSelect) {
        const uniqueTypes = [...new Set(sampleStores.map(s => s.type))].sort();
        storeTypeSelect.innerHTML = '<option value="">Tüm Türler</option>';
        uniqueTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            storeTypeSelect.appendChild(option);
        });
    }
    
    // Arama input event listener
    const storeSearchInput = document.getElementById('storeSearchInput');
    if (storeSearchInput) {
        storeSearchInput.addEventListener('input', (e) => {
            const clearBtn = document.getElementById('clearStoreSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = e.target.value ? 'flex' : 'none';
            }
        });
        
        storeSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyStoreFilters();
            }
        });
    }
    
    // ✅ İSTEK 4: Seçili il varsa başlangıçta filtrele
    if (selectedProvince) {
        applyStoreFilters();
    }
}

function applyStoreFilters() {
    storeSearchTerm = document.getElementById('storeSearchInput')?.value.toLowerCase().trim() || '';
    selectedStoreProvince = document.getElementById('storeProvinceFilter')?.value || '';
    selectedStoreType = document.getElementById('storeTypeFilter')?.value || '';
    
    // Satış yerlerini filtrele
    filteredStores = sampleStores.filter(store => {
        const matchesSearch = !storeSearchTerm || 
            store.name.toLowerCase().includes(storeSearchTerm) ||
            store.address.toLowerCase().includes(storeSearchTerm) ||
            store.city.toLowerCase().includes(storeSearchTerm) ||
            store.type.toLowerCase().includes(storeSearchTerm);
        
        const matchesProvince = !selectedStoreProvince || store.city === selectedStoreProvince;
        const matchesType = !selectedStoreType || store.type === selectedStoreType;
        
        return matchesSearch && matchesProvince && matchesType;
    });
    
    // Marker'ları güncelle
    showStoreMarkers();
    
    // İstatistik göster
    console.log(`🔍 ${filteredStores.length} / ${sampleStores.length} satış noktası gösteriliyor`);
}

function clearStoreSearch() {
    const storeSearchInput = document.getElementById('storeSearchInput');
    if (storeSearchInput) {
        storeSearchInput.value = '';
        storeSearchTerm = '';
    }
    const clearBtn = document.getElementById('clearStoreSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    applyStoreFilters();
}

function resetStoreFilters() {
    // Arama alanını temizle
    const storeSearchInput = document.getElementById('storeSearchInput');
    if (storeSearchInput) {
        storeSearchInput.value = '';
        storeSearchTerm = '';
    }
    
    const clearBtn = document.getElementById('clearStoreSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    // Dropdown'ları resetle
    const storeProvinceSelect = document.getElementById('storeProvinceFilter');
    if (storeProvinceSelect) {
        storeProvinceSelect.value = '';
        selectedStoreProvince = '';
    }
    
    const storeTypeSelect = document.getElementById('storeTypeFilter');
    if (storeTypeSelect) {
        storeTypeSelect.value = '';
        selectedStoreType = '';
    }
    
    // Tüm satış yerlerini göster
    filteredStores = [...sampleStores];
    if (whereToBuyMode && whereMap) {
        showStoreMarkers();
    }
}
// ========================================
// BAĞLANTI ÇİZGİLERİ FONKSİYONLARI
// ========================================

function initConnectionLines() {
    if (!svgLayer) {
        svgLayer = document.getElementById('connection-lines-layer');
    }
    
    if (!svgLayer) {
        console.warn('⚠️ SVG layer bulunamadı');
        return;
    }
    
    // Tüm çizgileri temizle
    svgLayer.innerHTML = '';
    connectionLines = {};
    linePaths = {};
    cardElements = {};
    activeProductId = null;
    
    console.log('🎨 Bağlantı çizgileri başlatılıyor...');
    
    // Event listener'ları ekle
    setupConnectionEventListeners();
}

function createConnectionLine(product, storeMarker) {
    if (!svgLayer || !product || !storeMarker) {
        console.warn('⚠️ createConnectionLine: Eksik parametre', { svgLayer: !!svgLayer, product: !!product, storeMarker: !!storeMarker });
        return null;
    }
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-curve');
    path.dataset.productId = product.id;
    path.dataset.productName = product.name;
    
    // Başlangıç stili
    applyLineStyle(path, STYLES.default);
    
    svgLayer.appendChild(path);
    
    if (!connectionLines[product.id]) {
        connectionLines[product.id] = [];
    }
    connectionLines[product.id].push({
        path: path,
        marker: storeMarker,
        product: product,
        cardElement: null // Cache için
    });
    
    // linePaths için de ekle
    if (!linePaths[product.id]) {
        linePaths[product.id] = [];
    }
    linePaths[product.id].push({
        path: path,
        marker: storeMarker,
        product: product
    });
    
    return path;
}

function updateConnectionLines() {
    console.log('🔍 updateConnectionLines çağrıldı', { whereToBuyMode, whereMap: !!whereMap, svgLayer: !!svgLayer });
    
    if (!whereToBuyMode || !whereMap || !svgLayer) {
        // Normal modda çizgileri gizle
        if (svgLayer) {
            svgLayer.style.display = 'none';
        }
        console.log('⚠️ Çizgiler gizlendi (mod aktif değil)');
        return;
    }
    
    svgLayer.style.display = 'block';
    console.log('✅ SVG layer görünür yapıldı');
    
    const whereMapContainer = document.getElementById('whereMap');
    if (!whereMapContainer) {
        console.error('❌ whereMap container bulunamadı');
        return;
    }
    
    const mapRect = whereMapContainer.getBoundingClientRect();
    console.log('📐 whereMap rect:', mapRect);
    
    const connectionCount = Object.keys(connectionLines).length;
    console.log(`📊 ${connectionCount} product için bağlantılar var`);
    
    // ✅ PERFORMANCE: Tek batch'te tüm hesaplamaları yap
    let pathsToUpdate = [];
    let visiblePaths = 0;
    let hiddenPaths = 0;
    
    Object.keys(connectionLines).forEach(productId => {
        const connections = connectionLines[productId];
        
        connections.forEach(conn => {
            const { path, marker, product } = conn;
            
            // Product card'ı cache'den al veya bul
            if (!conn.cardElement) {
                // ✅ DÜZELTME: Sadece product-card class'ına sahip kartları seç (SVG path değil!)
                conn.cardElement = document.querySelector(`.product-card[data-product-id="${product.id}"]`);
                if (!conn.cardElement) {
                    console.warn(`⚠️ Card bulunamadı: ${product.name} (id: ${product.id})`);
                    console.log(`   Selector: .product-card[data-product-id="${product.id}"]`);
                    console.log(`   Tüm kartlar:`, document.querySelectorAll('.product-card[data-product-id]').length);
                }
            }
            const productCard = conn.cardElement;
            
            if (!productCard) {
                if (path.style.display !== 'none') {
                    path.style.display = 'none';
                }
                hiddenPaths++;
                console.log(`❌ ${product.name}: Card yok`);
                return;
            }
            
            if (!whereMap.hasLayer(marker)) {
                if (path.style.display !== 'none') {
                    path.style.display = 'none';
                }
                hiddenPaths++;
                console.log(`❌ ${product.name}: Marker haritada değil`);
                return;
            }
            
            // ✅ YENİ: Marker haritada görünür mü kontrol et
            const markerLatLng = marker.getLatLng();
            const mapBounds = whereMap.getBounds();
            
            if (!mapBounds.contains(markerLatLng)) {
                // Marker haritanın dışında - çizgiyi gizle
                if (path.style.display !== 'none') {
                    path.style.display = 'none';
                }
                hiddenPaths++;
                return;
            }
            
            const cardRect = productCard.getBoundingClientRect();
            if (cardRect.width === 0 || cardRect.height === 0) {
                if (path.style.display !== 'none') {
                    path.style.display = 'none';
                }
                hiddenPaths++;
                return;
            }
            
            // Başlangıç ve bitiş noktaları
            const startX = cardRect.right; // SAĞ taraf (ikinci harita gibi)
            const startY = cardRect.top + (cardRect.height / 2);
            
            const markerPoint = whereMap.latLngToContainerPoint(markerLatLng);
            const endX = markerPoint.x + mapRect.left;
            const endY = markerPoint.y + mapRect.top;
            
            // Bezier kontrol noktaları (ikinci haritadaki gibi)
            const control1X = startX + (endX - startX) * 0.3;
            const control1Y = startY;
            const control2X = startX + (endX - startX) * 0.7;
            const control2Y = endY;
            
            // Path data
            const d = `M${startX},${startY} C${control1X},${control1Y} ${control2X},${control2Y} ${endX},${endY}`;
            
            pathsToUpdate.push({ path, d, product: product.name });
            visiblePaths++;
        });
    });
    
    console.log(`📊 Görünür: ${visiblePaths}, Gizli: ${hiddenPaths}`);
    
    // ✅ Tek batch'te tüm path'leri güncelle (reflow optimize)
    pathsToUpdate.forEach(({ path, d, product }) => {
        if (path.style.display !== 'block') {
            path.style.display = 'block';
        }
        if (path.getAttribute('d') !== d) {
            path.setAttribute('d', d);
        }
    });
    
    if (pathsToUpdate.length > 0) {
        console.log(`✅ ${pathsToUpdate.length} çizgi güncellendi`);
        console.log('🎨 İlk çizgi örneği:', pathsToUpdate[0].d.substring(0, 100));
    } else {
        console.warn('⚠️ Hiç çizgi güncellenmedi!');
    }
}

function clearConnectionLines() {
    if (svgLayer) {
        svgLayer.innerHTML = '';
    }
    // ✅ Tüm cache'leri temizle
    Object.keys(connectionLines).forEach(productId => {
        connectionLines[productId].forEach(conn => {
            conn.cardElement = null;
        });
    });
    connectionLines = {};
    linePaths = {};
    cardElements = {};
    activeProductId = null;
    lockedLocationId = null; // ✅ Lock'u da temizle
}

function highlightProductConnections(productId, state = 'active') {
    if (!connectionLines[productId]) return;
    
    // Önce tüm çizgileri normale döndür
    document.querySelectorAll('.connection-curve').forEach(path => {
        path.classList.remove('active', 'hover');
    });
    
    // Seçili ürünün çizgilerini vurgula
    if (productId && state) {
        connectionLines[productId].forEach(conn => {
            conn.path.classList.remove('active', 'hover');
            conn.path.classList.add(state);
        });
    }
}

function startConnectionAnimation() {
    let lastUpdate = 0;
    const throttleMs = 50; // 20 FPS yeterli (60 yerine)
    
    function animate(timestamp) {
        // Throttle: Her 50ms'de bir güncelle
        if (timestamp - lastUpdate >= throttleMs) {
            if (whereToBuyMode && whereMap) {
                updateConnectionLines();
            }
            lastUpdate = timestamp;
        }
        animationFrameId = requestAnimationFrame(animate);
    }
    
    if (!animationFrameId) {
        animate(0);
    }
}

function stopConnectionAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}
// ========================================
// GELİŞMİŞ İNTERAKSİYON FONKSİYONLARI
// ========================================

// Çizgi stilini uygula
function applyLineStyle(path, style) {
    if (!path) return;
    path.style.opacity = style.opacity;
    path.style.strokeWidth = style.strokeWidth + 'px';
}

// Tüm çizgi stillerini güncelle
function updateAllLineStyles() {
    Object.keys(linePaths).forEach(productId => {
        const connections = linePaths[productId];
        const isActive = (productId == activeProductId);
        
        connections.forEach(conn => {
            const style = isActive ? STYLES.active : STYLES.default;
            applyLineStyle(conn.path, style);
        });
    });
}

// Aktif ürünü ayarla
function setActiveProduct(productId) {
    activeProductId = productId;
    
    // Kart görünümlerini güncelle
    document.querySelectorAll('.product-card').forEach(card => {
        const cardProductId = card.dataset.productId;
        if (cardProductId == productId) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    
    // Çizgi stillerini güncelle
    updateAllLineStyles();
    
    // Eğer bir ürün seçiliyse, marker'larına zoom yap
    if (productId && linePaths[productId]) {
        const bounds = [];
        linePaths[productId].forEach(conn => {
            if (whereMap.hasLayer(conn.marker)) {
                bounds.push(conn.marker.getLatLng());
            }
        });
        
        if (bounds.length > 0) {
            whereMap.fitBounds(L.latLngBounds(bounds), { 
                padding: [80, 80],
                maxZoom: 16
            });
        }
    }
}

// Lokasyon ürünlerini vurgula (marker tıklayınca)
function highlightLocationProducts(locationId, storeData) {
    if (!storeData || !storeData.products || storeData.products.length === 0) return;
    
    // ✅ Location'ı lock'la - hover artık etkilemez
    lockedLocationId = locationId;
    
    // Bu lokasyonda satılan tüm ürünlerin çizgilerini vurgula
    Object.keys(linePaths).forEach(productId => {
        const connections = linePaths[productId];
        connections.forEach(conn => {
            // Marker'ın locationId'sini kontrol et
            const isThisLocation = conn.marker._locationId === locationId;
            const style = isThisLocation ? STYLES.active : STYLES.default;
            applyLineStyle(conn.path, style);
        });
    });
    
    // İlk ürünün kartına scroll yap
    const firstProductName = storeData.products[0];
    const firstProduct = selectedProductsSnapshot.find(p => p.name === firstProductName);
    
    if (firstProduct && cardElements[firstProduct.id]) {
        const card = cardElements[firstProduct.id];
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Kartı geçici vurgula
        card.classList.add('active');
        setTimeout(() => {
            if (activeProductId !== firstProduct.id) {
                card.classList.remove('active');
            }
        }, 2000);
    }
}

// Event listener'ları kur
function setupConnectionEventListeners() {
    const productsPanel = document.getElementById('productsPanel');
    if (!productsPanel) return;
    
    // Kart tıklama - CAPTURE PHASE'de yakalama (öncelikli)
    productsPanel.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card && whereToBuyMode) {
            // ✅ Modal açılmasını engelle
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // ✅ Karta tıklayınca lock'u kaldır
            lockedLocationId = null;
            
            const productId = card.dataset.productId;
            const newActiveId = (productId == activeProductId) ? null : productId;
            setActiveProduct(newActiveId);
            return false;
        }
    }, true); // ✅ CAPTURE PHASE - önce bu yakalanır
    
    // Kart hover
    productsPanel.addEventListener('mouseover', (e) => {
        // ✅ Eğer location locked ise hover yapma
        if (lockedLocationId !== null) return;
        
        const card = e.target.closest('.product-card');
        if (card && whereToBuyMode && card.dataset.productId != activeProductId) {
            const productId = card.dataset.productId;
            if (linePaths[productId]) {
                linePaths[productId].forEach(conn => {
                    applyLineStyle(conn.path, STYLES.hover);
                });
            }
        }
    });
    
    productsPanel.addEventListener('mouseout', (e) => {
        // ✅ Eğer location locked ise mouseout işleme
        if (lockedLocationId !== null) return;
        
        const card = e.target.closest('.product-card');
        if (card && whereToBuyMode) {
            updateAllLineStyles();
        }
    });
    
    // Panel scroll - çizgileri güncelle
    productsPanel.addEventListener('scroll', () => {
        if (whereToBuyMode) {
            requestAnimationFrame(() => updateConnectionLines());
        }
    });
    
    // Window resize - çizgileri güncelle
    window.addEventListener('resize', () => {
        if (whereToBuyMode) {
            requestAnimationFrame(() => updateConnectionLines());
        }
    });
    
    console.log('✅ Connection event listeners kuruldu');
}