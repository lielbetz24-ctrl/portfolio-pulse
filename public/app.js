/* ==========================================================================
   PortfolioPulse AI - Modern Application Logic, Financial Calculations & AI
   ========================================================================== */

// ==================== הגדרות API ומפתחות גישה בזמן אמת ====================
const API_CONFIG = {
    // מפתח ה-API האישי שלך (למשל עבור Alpha Vantage או שירות מנויים של Yahoo)
    // כרגע המערכת משתמשת ב-Yahoo Finance Chart הציבורי שלא דורש מפתח לצורך משיכה,
    // אך אם ברצונך להזין מפתח גישה אישי לעתיד, תוכל להקליד אותו כאן:
    API_KEY: "YOUR_API_KEY_HERE",
    
    // כתובת ה-API הבסיסית של שירות השערים
    BASE_URL: "https://query1.finance.yahoo.com/v8/finance/chart/"
};

// מאגר מחירי המניות המסונכרנים בזמן אמת - מתחיל ריק לחלוטין למניעת הצגת נתוני דמו פיקטיביים שגויים!
const MOCK_STOCK_PRICES = {};


// מאגר חיפוש סמנטי למניות (Semantic Stock Metadata) - מוגדר בראש הקובץ לצורך סנכרון שערים
const SEMANTIC_STOCK_DATABASE = [
    { ticker: 'AAPL', name: 'Apple Inc.', keywords: ['apple', 'אפל', 'אייפון', 'iphone', 'mac', 'ios', 'טלפון', 'סלולר', 'טכנולוגיה', 'צריכה', 'חומרה', 'אייפד'] },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', keywords: ['nvidia', 'אנבידיה', 'שבבים', 'gpu', 'ai', 'בינה מלאכותית', 'כרטיסי מסך', 'חומרה', 'טכנולוגיה', 'מעבדים'] },
    { ticker: 'TSLA', name: 'Tesla Inc.', keywords: ['tesla', 'טסלה', 'רכב חשמלי', 'ev', 'מכוניות', 'סוללות', 'אילון מאסק', 'fsd', 'אנרגיה', 'תחבורה', 'רובוטקסי'] },
    { ticker: 'MSFT', name: 'Microsoft Corp.', keywords: ['microsoft', 'מיקרוסופט', 'חלונות', 'windows', 'copilot', 'ענן', 'azure', 'office', 'תוכנה', 'טכנולוגיה', 'בינה מלאכותית'] },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', keywords: ['google', 'alphabet', 'גוגל', 'אלפבית', 'חיפוש', 'יוטיוב', 'youtube', 'אנדרואיד', 'דפדפן', 'טכנולוגיה', 'ענן'] },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', keywords: ['amazon', 'אמזון', 'קניות', 'מסחר אלקטרוני', 'ענן', 'aws', 'משלוחים', 'קמעונאות', 'איקומרס'] },
    { ticker: 'META', name: 'Meta Platforms Inc.', keywords: ['meta', 'facebook', 'פייסבוק', 'מטא', 'אינסטגרם', 'instagram', 'whatsapp', 'וואטסאפ', 'רשת חברתית', 'מציאות מדומה', 'vr', 'פרסום'] },
    { ticker: 'NFLX', name: 'Netflix Inc.', keywords: ['netflix', 'נטפליקס', 'סרטים', 'סדרות', 'סטרימינג', 'טלוויזיה', 'בידור', 'מנוי'] },
    { ticker: 'AMD', name: 'Advanced Micro Devices Inc.', keywords: ['amd', 'אי אם די', 'שבבים', 'מעבדים', 'gpu', 'cpu', 'כרטיסי מסך', 'חומרה', 'טכנולוגיה', 'גיימינג'] },
    { ticker: 'INTC', name: 'Intel Corp.', keywords: ['intel', 'אינטל', 'שבבים', 'מעבדים', 'cpu', 'ייצור', 'חומרה', 'טכנולוגיה', 'מפעל'] },
    { ticker: 'TSM', name: 'Taiwan Semiconductor Manufacturing', keywords: ['tsmc', 'tsm', 'טי אס אם סי', 'שבבים', 'מפעל', 'טאיוואן', 'ייצור', 'חומרה', 'טכנולוגיה'] },
    { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.', keywords: ['berkshire', 'hathaway', 'ברקשייר', 'האתאוויי', 'וורן באפט', 'באפט', 'השקעות', 'ביטוח', 'ערך', 'פיננסים'] },
    { ticker: 'JPM', name: 'JPMorgan Chase & Co.', keywords: ['jpmorgan', 'jpm', 'ג\'יי פי מורגן', 'מורגן', 'בנקים', 'פיננסים', 'הלוואות', 'השקעות', 'כסף', 'וול סטריט'] },
    { ticker: 'V', name: 'Visa Inc.', keywords: ['visa', 'ויזה', 'אשראי', 'תשלומים', 'כרטיסים', 'פיננסים', 'סליקה', 'טכנולוגיית תשלום'] },
    { ticker: 'DIS', name: 'The Walt Disney Co.', keywords: ['disney', 'דיסני', 'סרטים', 'פארקים', 'מיקי מאוס', 'סטרימינג', 'disney+', 'בידור', 'ילדים'] },
    { ticker: 'SBUX', name: 'Starbucks Corp.', keywords: ['starbucks', 'sbux', 'סטארבקס', 'קפה', 'משקאות', 'רשת בתי קפה', 'צריכה', 'מזון'] },
    { ticker: 'KO', name: 'The Coca-Cola Co.', keywords: ['coca cola', 'coke', 'קוקה קולה', 'קולה', 'משקאות', 'מים', 'קולה זירו', 'צריכה', 'מותג'] },
    { ticker: 'NKE', name: 'Nike Inc.', keywords: ['nike', 'נייק', 'נייקי', 'נעליים', 'ספורט', 'ביגוד', 'אופנה', 'צריכה', 'ריצה'] },
    { ticker: 'XOM', name: 'Exxon Mobil Corp.', keywords: ['exxon', 'mobil', 'אקסון', 'מוביל', 'נפט', 'גז', 'אנרגיה', 'דלק', 'סקטור אנרגיה'] },
    { ticker: 'LLY', name: 'Eli Lilly & Co.', keywords: ['eli lilly', 'lilly', 'אלי לילי', 'לילי', 'תרופות', 'בריאות', 'סוכרת', 'הרזיה', 'פארמה', 'רפואה'] }
];

// רשימת טיפים מובנים של ה-AI היועץ
const PRELOADED_TIPS = [
    { id: 't1', ticker: 'NVDA', content: 'מניית אנבידיה (NVDA) נסחרת במכפיל רווח גבוה במיוחד עקב דרישת שיא לשבבי AI. התיק שלך מחזיק במניה זו; מומלץ לשקול מימוש רווחים חלקי אם היא מהווה מעל 25% מהתיק הכולל כדי להקטין תנודתיות.', date: '2026-05-26' },
    { id: 't2', ticker: 'AAPL', content: 'אפל (AAPL) מראה יציבות פיננסית חזקה וגידול מרשים בהכנסות משירותים (iCloud, Services). מניית עוגן בטוחה המהווה הגנה מצוינת בתקופות של אי-ודאות בשווקים.', date: '2026-05-26' },
    { id: 't3', ticker: 'TSLA', content: 'טסלה (TSLA) חווה לחץ תחרותי גובר מצד יצרניות רכב חשמלי בסין. תמחור המניה הנוכחי משקף ציפיות גבוהות לפריצת דרך בנהיגה אוטונומית (FSD). החזקה במניה זו דורשת סובלנות גבוהה לסיכון ותנודתיות.', date: '2026-05-26' },
    { id: 't4', ticker: 'MSFT', content: 'מיקרוסופט (MSFT) נהנית מיתרון עצום בשוק הענן והשותפות עם OpenAI. החזקת המניה לטווח ארוך נחשבת לאסטרטגיה ברמת סיכון נמוכה-בינונית עם פוטנציאל צמיחה עקבי.', date: '2026-05-26' },
    { id: 't5', ticker: null, content: 'שמירה על רשת ביטחון של 10%-15% מזומן בתיק היא קריטית בתקופות של תנודתיות. יתרת מזומן פנויה מאפשרת לך לבצע רכישות אסטרטגיות בירידות שערים מבלי להצטרך למכור מניות בהפסד.', date: '2026-05-26' },
    { id: 't6', ticker: null, content: 'ביזור הוא כלי ההגנה הטוב ביותר שלך. השתדל שלא לחשוף מעל 20% מכלל ההון למניה בודדת, והקפד לחלק את ההשקעות בין מספר סקטורים (טכנולוגיה, פיננסים, צריכה).', date: '2026-05-26' }
];

// משתני המצב הגלובליים של האפליקציה (State)
let currentUser = null;
let portfolios = [];
let transactions = [];
let allUsers = [];
let allTips = [];
let chartInstance = null;
let detailChartInstance = null;
let activeView = 'dashboard';
let currentHoldings = {}; // מוחזק עבור הלקוח הפעיל במסך הלקוח
let displayCurrency = 'USD';
let usdToIlsRate = 3.75; // שער חליפין דינמי, יימשך בזמן אמת באמצעות ILS=X

// ==================== 1. אתחול והגדרת נתוני ברירת מחדל (Bootstrap) ====================
document.addEventListener("DOMContentLoaded", () => {
    initLocalCache();
    initTransactionModalEvents();
    initTipModalEvents();
    initLivePricePolling();
    checkSession();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered successfully:', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }

    // Hide download buttons if already running in native app or standalone PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || navigator.userAgent.includes('PortfolioPulseApp');
    if (isStandalone) {
        document.documentElement.classList.add('standalone-app');
        setTimeout(() => {
            const authDownload = document.querySelector('.mobile-apps-download');
            const sidebarDownload = document.querySelector('.sidebar-app-download');
            if (authDownload) authDownload.style.display = 'none';
            if (sidebarDownload) sidebarDownload.style.display = 'none';
        }, 150);
    }
});

// ==================== 1.1 אינטגרציה עם API לנתוני שוק חיים (Yahoo Finance via CORS Proxy) ====================
let isLiveSyncing = false;
let lastSyncTime = null;

// פונקציית עזר המבצעת Fetch בעלת מנגנון נפילה רכה (Fallback) בין מספר שרתי פרוקסי CORS פומביים ויציבים!
async function fetchWithCORS(targetUrl) {
    const proxies = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];
    
    let lastError = null;
    for (const getProxyUrl of proxies) {
        try {
            const proxyUrl = getProxyUrl(targetUrl);
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return response;
            }
            lastError = new Error(`Proxy failed with status: ${response.status}`);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("All CORS proxies failed");
}

async function fetchTickerChartData(ticker) {
    try {
        const stock = await API.marketChart(ticker);
        console.log(`[Market API] ${ticker}:`, stock);
        updateVisualAPIDebugger(ticker, stock);
        return stock;
    } catch (e) {
        console.error(`[Market API] Failed for ${ticker}:`, e);
        updateVisualAPIDebugger(ticker, { error: e.message, status: 'Failed' });
        return null;
    }
}

// פונקציית עזר המעדכנת את הדיבאגר הוויזואלי במסך המנהל
function updateVisualAPIDebugger(ticker, rawData) {
    try {
        const debuggerEl = document.getElementById('api-raw-response');
        const debuggerTickerEl = document.getElementById('api-debug-ticker');
        const debuggerTimeEl = document.getElementById('api-debug-time');
        
        if (debuggerEl) {
            debuggerEl.textContent = JSON.stringify(rawData, null, 2);
        }
        if (debuggerTickerEl) {
            debuggerTickerEl.textContent = ticker.toUpperCase();
        }
        if (debuggerTimeEl) {
            debuggerTimeEl.textContent = new Date().toLocaleTimeString('he-IL');
        }
    } catch (e) {
        console.error("Error updating visual API Debugger:", e);
    }
}

async function fetchLivePrices() {
    if (isLiveSyncing) return;
    
    const syncBadge = document.getElementById('market-sync-badge');
    const syncStatusText = document.getElementById('market-sync-status');
    const syncIcon = document.getElementById('sync-icon-spin');
    // קבלת כל סימולי המניות הייחודיים הקיימים בתיקי הלקוחות
    const uniqueTickersSet = new Set();
    
    portfolios.forEach(p => {
        const metrics = calculatePortfolioMetrics(p.id);
        if (metrics && metrics.holdingsList) {
            metrics.holdingsList.forEach(h => {
                if (h.ticker) uniqueTickersSet.add(h.ticker.toUpperCase());
            });
        }
    });

    // הוספה תמיד של שער החליפין דולר/שקל לרשימת הסנכרון
    uniqueTickersSet.add('ILS=X');
    
    const tickersList = Array.from(uniqueTickersSet);
    if (tickersList.length === 0) return;
    
    isLiveSyncing = true;
    if (syncIcon) syncIcon.style.animation = 'spinIcon 1s infinite linear';
    if (syncStatusText) syncStatusText.textContent = 'מסנכרן שערים חיים...';
    if (syncBadge) {
        syncBadge.style.background = 'rgba(0, 242, 254, 0.08)';
        syncBadge.style.color = 'var(--accent-blue-start)';
        syncBadge.style.borderColor = 'rgba(0, 242, 254, 0.2)';
    }

    try {
        const { prices, usdToIls } = await API.marketPrices(tickersList);
        if (usdToIls && usdToIls > 0) {
            usdToIlsRate = usdToIls;
            console.log(`Dynamic USD/ILS rate updated: ${usdToIlsRate}`);
        }

        Object.entries(prices || {}).forEach(([symbol, stock]) => {
            if (!stock || symbol === 'ILS=X') return;
            let price = stock.price;
            const change = stock.change;
            if (price !== undefined && price !== null && price > 0) {
                if (symbol.endsWith('.TA')) {
                    let priceInIls = price;
                    if (stock.currency === 'ILA' || stock.currency === 'GBp' || price > 1000) {
                        priceInIls = price / 100;
                    }
                    price = priceInIls / usdToIlsRate;
                }
                MOCK_STOCK_PRICES[symbol] = { name: stock.name, price, change, previousClose: stock.previousClose };
            }
        });

        if (currentUser && currentUser.role === 'admin' && tickersList[0]) {
            updateVisualAPIDebugger(tickersList[0], prices);
        }
        
        // שמירת השערים ושער החליפין ב-localStorage כדי לשמר אותם בריענוני דף
        try {
            localStorage.setItem('market_stock_prices', JSON.stringify(MOCK_STOCK_PRICES));
            localStorage.setItem('usd_to_ils_rate', usdToIlsRate.toString());
        } catch(e) {
            console.error("Failed to save live stock prices to localStorage:", e);
        }
        
        lastSyncTime = new Date();
        isLiveSyncing = false;
        
        // עדכון חזותי להצלחה
        if (syncIcon) syncIcon.style.animation = 'none';
        if (syncStatusText) {
            const timeString = lastSyncTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            syncStatusText.textContent = `סנכרון שוק: פעיל (${timeString}) | עיכוב נתונים: 15 דק' כמקובל`;
        }
        if (syncBadge) {
            syncBadge.style.background = 'rgba(0, 230, 118, 0.08)';
            syncBadge.style.color = 'var(--pos-green)';
            syncBadge.style.borderColor = 'rgba(0, 230, 118, 0.2)';
        }
        
        // רענון אוטומטי — דאשבורד לקוח, מנהל, ומסך צפייה בתיק לקוח
        await loadUserData();
        if (activeView === 'dashboard') renderCharts();
        else if (activeView === 'client-detail') {
            const clientNameEl = document.getElementById('detail-client-name');
            if (clientNameEl && clientNameEl.textContent !== '—') {
                const client = allUsers.find(u => u.name === clientNameEl.textContent);
                if (client) viewClientPortfolio(client.id);
            }
        }
        
    } catch (error) {
        console.error('Error fetching live stock prices:', error);
        isLiveSyncing = false;
        
        if (syncIcon) syncIcon.style.animation = 'none';
        if (syncStatusText) syncStatusText.textContent = 'סנכרון שרת שערים נכשל (מקומי) | עיכוב נתונים: 15 דק\'';
        if (syncBadge) {
            syncBadge.style.background = 'rgba(255, 23, 68, 0.08)';
            syncBadge.style.color = 'var(--neg-red)';
            syncBadge.style.borderColor = 'rgba(255, 23, 68, 0.2)';
        }
    }
}

// אתחול מנגנון הפולינג ברקע
function initLivePricePolling() {
    // הפעלה ראשונית מיידית
    fetchLivePrices();
    
    // מרווח פולינג קבוע - עדכון שערים בכל 60 שניות כדי לא להעמיס על הפרוקסי
    setInterval(fetchLivePrices, 60000);
}

function initLocalCache() {
    try {
        const savedPrices = localStorage.getItem('market_stock_prices');
        if (savedPrices) Object.assign(MOCK_STOCK_PRICES, JSON.parse(savedPrices));
        const savedRate = localStorage.getItem('usd_to_ils_rate');
        if (savedRate) usdToIlsRate = parseFloat(savedRate) || 3.75;
    } catch (e) {
        console.error("Error restoring market cache:", e);
    }
}

async function checkSession() {
    const token = API.getToken();
    const cached = sessionStorage.getItem('current_user');
    if (!token) {
        showAuthScreen();
        return;
    }
    try {
        const { user } = await API.me();
        currentUser = user;
        sessionStorage.setItem('current_user', JSON.stringify(user));
        await setupAppForUser();
    } catch {
        API.setToken(null);
        sessionStorage.removeItem('current_user');
        if (cached) showToast('פג תוקף ההתחברות — התחבר מחדש', 'error');
        showAuthScreen();
    }
}

async function setupAppForUser() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');

    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-role').textContent = currentUser.role === 'admin' ? 'יועץ השקעות מנהל' : 'לקוח קצה';

    renderSidebarNavigation();
    await loadUserData();

    if (currentUser.role === 'admin') {
        switchView('admin-dashboard');
    } else {
        switchView('dashboard');
        initAIChat();
    }

    showToast(`ברוך הבא, ${currentUser.name}!`, 'success');
}

function showAuthScreen() {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
}

// בניית תפריט הצד בהתאם לתפקיד המשתמש
function renderSidebarNavigation() {
    const navContainer = document.getElementById('sidebar-navigation');
    navContainer.innerHTML = '';

    if (currentUser.role === 'admin') {
        // תפריט של יועץ/מנהל (Admin)
        navContainer.innerHTML = `
            <button class="nav-item active" onclick="switchView('admin-dashboard')" id="nav-admin-dashboard">
                <span class="material-icons-round">manage_accounts</span>
                <span>לוח בקרה יועץ</span>
            </button>
            <button class="nav-item" onclick="switchView('admin-tips')" id="nav-admin-tips">
                <span class="material-icons-round">campaign</span>
                <span>ניהול המלצות וטיפים</span>
                <span class="badge">ערוך</span>
            </button>
        `;
    } else {
        // תפריט של לקוח (Client)
        navContainer.innerHTML = `
            <button class="nav-item active" onclick="switchView('dashboard')" id="nav-dashboard">
                <span class="material-icons-round">space_dashboard</span>
                <span>לוח בקרה (Dashboard)</span>
            </button>
            <button class="nav-item" onclick="switchView('transactions')" id="nav-transactions">
                <span class="material-icons-round">history</span>
                <span>היסטוריית עסקאות</span>
            </button>
            <button class="nav-item nav-accent" onclick="switchView('ai-advisor')" id="nav-ai-advisor">
                <span class="material-icons-round sparkle-icon">psychology</span>
                <span>יועץ השקעות AI</span>
                <span class="badge">Live</span>
            </button>
        `;
    }
}

async function loadUserData() {
    if (!currentUser) return;

    try {
        const data = await API.sync();
        portfolios = data.portfolios || [];
        transactions = data.transactions || [];
        allTips = data.tips || [];
        allUsers = data.clients || [];

        // Instantly populate client prices if returned in sync to prevent empty initial renders (no dashes!)
        if (data.prices) {
            Object.entries(data.prices).forEach(([symbol, stock]) => {
                if (stock && stock.price != null) {
                    const price = Number(stock.price);
                    const change = Number(stock.change || 0);
                    MOCK_STOCK_PRICES[symbol] = {
                        name: stock.name || symbol,
                        price,
                        change,
                        previousClose: stock.previousClose || (price / (1 + change / 100))
                    };
                }
            });
            // Update localStorage as well
            localStorage.setItem('market_stock_prices', JSON.stringify(MOCK_STOCK_PRICES));
        }

        if (currentUser.role === 'client') {
            refreshCalculations();
        } else {
            refreshAdminCalculations();
        }
    } catch (e) {
        showToast(e.message || 'שגיאה בטעינת נתונים מהשרת', 'error');
    }
}

// ==================== 2. ניהול מסך התחברות והרשמה (Auth Screen) ====================
let currentAuthTab = 'login';

function switchAuthTab(tab) {
    currentAuthTab = tab;
    const nameGroup = document.getElementById('name-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchDesc = document.getElementById('auth-switch-desc');
    const loginTabBtn = document.getElementById('tab-login');
    const signupTabBtn = document.getElementById('tab-signup');

    if (tab === 'signup') {
        nameGroup.style.display = 'flex';
        submitBtn.querySelector('span:first-child').textContent = 'צור חשבון חדש';
        switchDesc.innerHTML = 'כבר יש לך חשבון? <a href="#" onclick="switchAuthTab(\'login\')">התחבר כאן</a>';
        loginTabBtn.classList.remove('active');
        signupTabBtn.classList.add('active');
    } else {
        nameGroup.style.display = 'none';
        submitBtn.querySelector('span:first-child').textContent = 'התחבר למערכת';
        switchDesc.innerHTML = 'עדיין אין לך חשבון? <a href="#" onclick="switchAuthTab(\'signup\')">הרשם עכשיו</a>';
        loginTabBtn.classList.add('active');
        signupTabBtn.classList.remove('active');
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const submitBtn = document.getElementById('auth-submit-btn');
    submitBtn.disabled = true;

    try {
        let result;
        if (currentAuthTab === 'login') {
            result = await API.login(email, password);
        } else {
            if (!name) {
                showToast('נא להזין שם מלא!', 'error');
                return;
            }
            result = await API.register({ name, email, password });
        }
        API.setToken(result.token);
        currentUser = result.user;
        sessionStorage.setItem('current_user', JSON.stringify(result.user));
        await setupAppForUser();
    } catch (e) {
        showToast(e.message || 'שגיאת התחברות', 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

function handleLogout() {
    API.setToken(null);
    sessionStorage.removeItem('current_user');
    currentUser = null;
    portfolios = [];
    transactions = [];
    allUsers = [];
    allTips = [];
    showAuthScreen();
    showToast('התנתקת מהמערכת בהצלחה.', 'success');
}

// ==================== 3. ניווט ומעבר בין מסכים (Routing/Tabs) ====================
function switchView(view) {
    activeView = view;
    
    // עדכון הטאב הפעיל בניווט הצדי
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.getElementById(`nav-${view}`);
    if (navItem) navItem.classList.add('active');

    // הצגת הפאנל המתאים
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`view-${view}-pane`).classList.add('active');

    // עדכון כותרת העמוד וסביבת הפעולה
    const titleEl = document.getElementById('view-title');
    const subtitleEl = document.getElementById('view-subtitle');
    const headerActionArea = document.getElementById('header-action-area');

    // ברירת מחדל: הצג כפתור עסקה חדשה רק ללקוחות קצה
    if (currentUser.role === 'client') {
        headerActionArea.style.display = 'block';
    } else {
        headerActionArea.style.display = 'none'; // מנהלים לא מזינים עסקאות לעצמם במסך שלהם
    }

    if (view === 'dashboard') {
        titleEl.textContent = 'לוח בקרה פיננסי';
        subtitleEl.textContent = 'מעקב ביצועים, רווחים והתפלגות תיק ההשקעות שלך';
        setTimeout(renderCharts, 50);
    } else if (view === 'transactions') {
        titleEl.textContent = 'היסטוריית פעולות ועסקאות';
        subtitleEl.textContent = 'רישום מלא של כל פעולות המניות והמזומן שבוצעו בתיק';
        renderTransactionsTable();
    } else if (view === 'ai-advisor') {
        titleEl.textContent = 'יועץ השקעות בינה מלאכותית (AI)';
        subtitleEl.textContent = 'ניתוח עמוק, המלצות מבוססות תיק וצ\'אט ייעוץ מותאם אישית';
        renderAITips();
        updateAIHealthScore();
    } else if (view === 'admin-dashboard') {
        titleEl.textContent = 'לוח בקרה ליועץ השקעות';
        subtitleEl.textContent = 'ניהול מעקב אחר לקוחות, סיכומי הון מנוהל וביצועים כוללים';
        refreshAdminCalculations();
    } else if (view === 'admin-tips') {
        titleEl.textContent = 'מערכת ניהול טיפים והמלצות';
        subtitleEl.textContent = 'כתיבה, עריכה ופרסום המלצות שוק או טיפים מותאמים אישית למניות';
        renderAdminTipsList();
    } else if (view === 'client-detail') {
        titleEl.textContent = 'צפייה בתיק לקוח';
        subtitleEl.textContent = 'סקירה מלאה, הרכב נכסים והיסטוריית פעולות של הלקוח הנבחר';
    }
}

// ==================== 4. לוגיקה פיננסית ללקוח (Client Financial Engine) ====================
function refreshCalculations() {
    if (portfolios.length === 0) return;
    
    const activePortfolio = portfolios[0];
    const metrics = calculatePortfolioMetrics(activePortfolio.id);

    currentHoldings = metrics.holdingsMap;

    // עדכון אלמנטים בדאשבורד — Total Equity = Σ(כמות × שער שוק) + מזומן
    const totalEquity = calculateTotalEquity(activePortfolio.id);
    document.getElementById('val-total-portfolio').textContent = formatCurrency(totalEquity);
    document.getElementById('val-cash-balance').textContent = formatCurrency(metrics.cash_balance);
    
    const pnlValEl = document.getElementById('val-total-pnl');
    const pnlPctEl = document.getElementById('val-total-pnl-pct');
    const pnlIconEl = document.getElementById('pnl-icon');

    if (metrics.totalPnL >= 0) {
        pnlValEl.textContent = `+${formatCurrency(metrics.totalPnL)}`;
        pnlValEl.className = 'metric-value pnl-positive';
        pnlPctEl.textContent = `+${metrics.totalPnLPct.toFixed(2)}%`;
        pnlPctEl.className = 'pnl-percent pnl-positive';
        pnlIconEl.textContent = 'trending_up';
        pnlIconEl.className = 'material-icons-round metric-icon green';
    } else {
        pnlValEl.textContent = `-${formatCurrency(Math.abs(metrics.totalPnL))}`;
        pnlValEl.className = 'metric-value pnl-negative';
        pnlPctEl.textContent = `${metrics.totalPnLPct.toFixed(2)}%`;
        pnlPctEl.className = 'pnl-percent pnl-negative';
        pnlIconEl.textContent = 'trending_down';
        pnlIconEl.className = 'material-icons-round metric-icon red';
    }

    renderHoldingsTable(metrics.holdingsList);
}

// ==================== 5. מנוע חישוב גנרי לתיק כלשהו (מפתח פתרון קריטי!) ====================
// פונקציה מודולרית המקבלת מזהה תיק השקעות, מריצה את כל הלוגיקה הפיננסית מול היסטוריית העסקאות,
// ומחזירה סטטיסטיקה מחושבת ומדויקת בזמן אמת! משמשת גם את הלקוח וגם את ממשקי המנהל (Client Viewer).
function calculatePortfolioMetrics(portfolioId) {
    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (!portfolio) return null;
    return PortfolioEngine.calculatePortfolioMetrics(portfolioId, transactions, MOCK_STOCK_PRICES);
}

// ==================== 5.1 לוגיקה ייעודית לחישוב שווי התיק הכולל (Total Equity) בזמן אמת ====================
function calculateTotalEquity(portfolioId) {
    const metrics = calculatePortfolioMetrics(portfolioId);
    return PortfolioEngine.calculateTotalEquity(metrics, MOCK_STOCK_PRICES);
}

function buildHoldingMainRow(holding, idx, prefix) {
    const stockInfo = MOCK_STOCK_PRICES[holding.ticker] || { name: holding.ticker, change: null };
    const tr = document.createElement('tr');
    tr.className = `holding-main-row ${PortfolioEngine.getPositionRowClass(holding)}`;
    tr.style.cursor = 'pointer';
    tr.id = `${prefix}-main-${idx}`;
    tr.onclick = () => toggleHoldingDetails(idx, prefix);

    const marketPriceCell = holding.current_price != null ? formatCurrency(holding.current_price) : '—';
    const portfolioValueCell = holding.current_price != null ? formatCurrency(holding.quantity * holding.current_price) : '—';

    let dailyChangeHtml;
    if (stockInfo.change != null && !isNaN(stockInfo.change)) {
        const dailyChange = stockInfo.change;
        const changeClass = dailyChange >= 0 ? 'pnl-positive' : 'pnl-negative';
        const changePrefix = dailyChange >= 0 ? '+' : '';
        dailyChangeHtml = `<span class="${changeClass}">${changePrefix}${dailyChange.toFixed(2)}%</span>`;
    } else {
        dailyChangeHtml = '<span class="text-muted">—</span>';
    }

    tr.innerHTML = `
        <td>
            <div class="stock-badge">
                <div class="stock-icon">${holding.ticker.substring(0, 2)}</div>
                <div class="stock-details">
                    <span class="stock-ticker">${holding.ticker}</span>
                    <span class="stock-name">${stockInfo.name || holding.ticker}</span>
                </div>
            </div>
        </td>
        <td style="font-family: var(--font-numbers); font-weight: 600;">${marketPriceCell}</td>
        <td>${dailyChangeHtml}</td>
        <td style="font-family: var(--font-numbers); font-weight: 700; color: var(--text-primary);">${portfolioValueCell}</td>
        <td style="text-align: center; color: var(--accent-blue-start);">
            <span class="material-icons-round" id="${prefix}-exp-icon-${idx}" style="transition: transform 0.3s; font-size: 18px;">expand_more</span>
        </td>
    `;
    return tr;
}

function buildHoldingDetailsRow(holding, idx, prefix) {
    const tr = document.createElement('tr');
    tr.id = `${prefix}-details-${idx}`;
    tr.className = 'holding-details-row';
    tr.style.display = 'none'; // Hidden by default
    tr.style.background = 'rgba(255, 255, 255, 0.015)';
    
    const purchasePriceCell = formatCurrency(holding.avg_buy_price);
    const quantityCell = holding.quantity.toFixed(4);

    let changeSincePurchaseHtml;
    if (holding.change_since_purchase_pct != null && !isNaN(holding.change_since_purchase_pct)) {
        const pct = holding.change_since_purchase_pct;
        const cls = pct >= 0 ? 'pnl-positive' : 'pnl-negative';
        const prefixSign = pct >= 0 ? '+' : '';
        changeSincePurchaseHtml = `<span class="${cls}">${prefixSign}${pct.toFixed(2)}%</span>`;
    } else {
        changeSincePurchaseHtml = '<span class="text-muted">—</span>';
    }

    const status = PortfolioEngine.getPositionStatusLabel(holding);
    const positionStatusHtml = `
        <span class="position-status-badge ${status.cssClass}">${status.text}</span>
    `;

    tr.innerHTML = `
        <td colspan="5" style="padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); background: rgba(0, 0, 0, 0.2);">
            <div class="holding-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; text-align: right;">
                <div class="detail-item">
                    <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 2px;">כמות מניות בתיק</span>
                    <strong style="font-family: var(--font-numbers); font-size: 0.9rem; color: var(--text-primary);">${quantityCell}</strong>
                </div>
                <div class="detail-item">
                    <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 2px;">שער קנייה ממוצע</span>
                    <strong style="font-family: var(--font-numbers); font-size: 0.9rem; color: var(--text-primary);">${purchasePriceCell}</strong>
                </div>
                <div class="detail-item">
                    <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 2px;">תשואה מקנייה</span>
                    <strong>${changeSincePurchaseHtml}</strong>
                </div>
                <div class="detail-item">
                    <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 2px;">סטטוס פוזיציה</span>
                    <div>${positionStatusHtml}</div>
                </div>
            </div>
        </td>
    `;
    return tr;
}

function toggleHoldingDetails(idx, prefix) {
    const detailsRow = document.getElementById(`${prefix}-details-${idx}`);
    const expIcon = document.getElementById(`${prefix}-exp-icon-${idx}`);
    
    if (!detailsRow) return;
    
    if (detailsRow.style.display === 'none') {
        detailsRow.style.display = 'table-row';
        if (expIcon) expIcon.style.transform = 'rotate(180deg)';
    } else {
        detailsRow.style.display = 'none';
        if (expIcon) expIcon.style.transform = 'rotate(0deg)';
    }
}

function renderHoldingsTable(holdingsList) {
    const tableBody = document.getElementById('holdings-table-body');
    const countBadge = document.getElementById('holdings-count');

    countBadge.textContent = `${holdingsList.length} נכסים`;
    tableBody.innerHTML = '';

    if (holdingsList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">
                    אין מניות מוחזקות כרגע בתיק זה. לחץ על "תיעוד פעולה" כדי לרכוש מניה.
                </td>
            </tr>
        `;
        return;
    }

    holdingsList.forEach((holding, idx) => {
        tableBody.appendChild(buildHoldingMainRow(holding, idx, 'client'));
        tableBody.appendChild(buildHoldingDetailsRow(holding, idx, 'client'));
    });
}

function renderHoldingsTableInto(tbodyElement, holdingsList, emptyMessage, prefix = 'admin-view') {
    if (!tbodyElement) return;
    tbodyElement.innerHTML = '';
    if (!holdingsList.length) {
        tbodyElement.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">${emptyMessage}</td></tr>`;
        return;
    }
    holdingsList.forEach((holding, idx) => {
        tbodyElement.appendChild(buildHoldingMainRow(holding, idx, prefix));
        tbodyElement.appendChild(buildHoldingDetailsRow(holding, idx, prefix));
    });
}

// ==================== 6. יצירת והצגת דיאגרמות (Chart.js Allocation) ====================
function renderCharts() {
    const ctx = document.getElementById('assetsDoughnutChart');
    const emptyState = document.getElementById('chart-empty-state');
    
    if (!ctx) return;

    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    
    // שליפת הנתונים העדכניים לתיק המחושב
    const metrics = calculatePortfolioMetrics(activePortfolio.id);

    const labels = ['מזומן פנוי'];
    const data = [metrics.cash_balance];
    const backgroundColors = ['rgba(182, 33, 255, 0.7)'];
    const hoverBackgroundColors = ['rgba(182, 33, 255, 0.9)'];

    const stockColorPalette = [
        'rgba(0, 242, 254, 0.7)',
        'rgba(0, 230, 118, 0.7)',
        'rgba(255, 179, 0, 0.7)',
        'rgba(255, 23, 68, 0.7)',
        'rgba(43, 97, 163, 0.7)',
        'rgba(0, 176, 255, 0.7)'
    ];

    let colorIdx = 0;
    let hasStocks = false;

    metrics.holdingsList.forEach(holding => {
        if (holding.quantity > 0) {
            hasStocks = true;
            labels.push(holding.ticker);
            data.push(holding.market_value);
            
            const color = stockColorPalette[colorIdx % stockColorPalette.length];
            backgroundColors.push(color);
            hoverBackgroundColors.push(color.replace('0.7', '0.9'));
            colorIdx++;
        }
    });

    if (metrics.cash_balance === 0 && !hasStocks) {
        ctx.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    ctx.style.display = 'block';
    emptyState.style.display = 'none';

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                hoverBackgroundColor: hoverBackgroundColors,
                borderWidth: 1.5,
                borderColor: '#0f131a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Rubik', size: 11 },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((value / total) * 100).toFixed(1);
                            return ` ${context.label}: ${formatCurrency(value)} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// ==================== 7. היסטוריית עסקאות ללקוח ====================
let currentTxFilter = 'all';

function filterTransactions(filter) {
    currentTxFilter = filter;
    document.querySelectorAll('.filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tableBody = document.getElementById('transactions-table-body');
    const emptyState = document.getElementById('transactions-empty-state');
    
    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    
    let filteredTxs = transactions.filter(tx => tx.portfolio_id === activePortfolio.id);

    filteredTxs.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

    if (currentTxFilter === 'buy') {
        filteredTxs = filteredTxs.filter(tx => tx.action_type === 'buy' || tx.action_type === 'holding');
    } else if (currentTxFilter === 'sell') {
        filteredTxs = filteredTxs.filter(tx => tx.action_type === 'sell');
    } else if (currentTxFilter === 'cash') {
        filteredTxs = filteredTxs.filter(tx => tx.action_type === 'deposit' || tx.action_type === 'withdraw');
    }

    tableBody.innerHTML = '';

    if (filteredTxs.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';

    filteredTxs.forEach(tx => {
        const tr = document.createElement('tr');
        
        let typeText = '';
        let typeClass = '';
        let tickerText = tx.ticker || '—';
        let qtyText = tx.quantity > 0 ? tx.quantity.toFixed(4).replace(/\.?0+$/, '') : '—';
        let priceText = tx.price > 0 ? formatCurrency(tx.price) + (tx.action_type === 'buy' || tx.action_type === 'holding' ? ' (ממוצע)' : '') : '—';
        let totalSum = 0;

        if (tx.action_type === 'buy') {
            typeText = 'קניית מניות';
            typeClass = 'tx-badge buy';
            totalSum = tx.quantity * tx.price;
        } else if (tx.action_type === 'holding') {
            typeText = 'הוספת אחזקה לתיק';
            typeClass = 'tx-badge buy';
            totalSum = tx.quantity * tx.price;
        } else if (tx.action_type === 'sell') {
            typeText = 'מכירת מניות';
            typeClass = 'tx-badge sell';
            totalSum = tx.quantity * tx.price;
        } else if (tx.action_type === 'deposit') {
            typeText = 'הפקדת מזומן';
            typeClass = 'tx-badge deposit';
            totalSum = tx.price;
            priceText = '—';
        } else if (tx.action_type === 'withdraw') {
            typeText = 'משיכת מזומן';
            typeClass = 'tx-badge withdraw';
            totalSum = tx.price;
            priceText = '—';
        }

        const formattedDate = new Date(tx.transaction_date).toLocaleString('he-IL', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
            <td class="tx-date">${formattedDate}</td>
            <td><span class="${typeClass}">${typeText}</span></td>
            <td class="stock-ticker">${tickerText}</td>
            <td>${qtyText}</td>
            <td>${priceText}</td>
            <td class="summary-total" style="font-size: 0.95rem; color: var(--text-primary)">${formatCurrency(totalSum)}</td>
            <td>
                <span class="status-tag">
                    <span class="material-icons-round" style="font-size: 16px;">check_circle</span>
                    אושר בבסיס נתונים
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// ==================== 8. מודל הוספת עסקאות ללקוח ====================
let suggestionFocusIndex = -1;

function initTransactionModalEvents() {
    const qtyInput = document.getElementById('tx-qty');
    const priceInput = document.getElementById('tx-price');
    const tickerInput = document.getElementById('tx-ticker');
    const dropdown = document.getElementById('ticker-suggestions');

    if (qtyInput) qtyInput.addEventListener('input', calculateModalTotal);
    if (priceInput) priceInput.addEventListener('input', calculateModalTotal);
    if (tickerInput) {
        tickerInput.addEventListener('input', handleTickerSearch);
        tickerInput.addEventListener('keydown', handleTickerKeyDown);
    }
    
    // סגירת רשימת הצעות בלחיצה מחוץ לתיבה
    document.addEventListener('click', function(e) {
        if (dropdown && e.target !== tickerInput && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            suggestionFocusIndex = -1;
        }
    });
}

let tipSuggestionFocusIndex = -1;

function initTipModalEvents() {
    const tickerInput = document.getElementById('tip-ticker');
    const dropdown = document.getElementById('tip-ticker-suggestions');

    if (tickerInput) {
        tickerInput.addEventListener('input', handleTipTickerSearch);
        tickerInput.addEventListener('keydown', handleTipTickerKeyDown);
    }
    
    // סגירת רשימת הצעות בלחיצה מחוץ לתיבה
    document.addEventListener('click', function(e) {
        if (dropdown && e.target !== tickerInput && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            tipSuggestionFocusIndex = -1;
        }
    });
}

function handleTipTickerSearch(e) {
    const term = e.target.value.trim().toLowerCase();
    const dropdown = document.getElementById('tip-ticker-suggestions');
    
    if (!dropdown) return;
    
    tipSuggestionFocusIndex = -1;
    
    if (!term) {
        dropdown.style.display = 'none';
        return;
    }
    
    // חיפוש סמנטי מקומי מיידי
    const localMatches = getLocalSemanticMatches(term);
    renderTipSuggestions(localMatches, dropdown);
    
    // חיפוש גלובלי
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        if (term.length < 2) return;
        const globalMatches = await fetchGlobalLiveMatches(term);
        const mergedMatches = mergeSearchMatches(localMatches, globalMatches);
        renderTipSuggestions(mergedMatches, dropdown);
    }, 300);
}

function renderTipSuggestions(matches, dropdown) {
    dropdown.innerHTML = '';
    
    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.style.display = 'flex';
    
    matches.forEach(match => {
        const stock = match.stock;
        const reason = match.reason;
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        
        const priceInfo = MOCK_STOCK_PRICES[stock.ticker] ? `$${MOCK_STOCK_PRICES[stock.ticker].price.toFixed(2)}` : 'שער חי';
        
        let reasonBadge = '';
        if (reason === 'סימול מותאם אישית') {
            reasonBadge = `<span class="suggestion-reason custom-badge">${reason}</span>`;
        } else if (reason === 'סימול מדויק' || reason === 'מתחיל בסימול' || reason === 'מכיל סימול') {
            reasonBadge = `<span class="suggestion-reason ticker-badge">${reason}</span>`;
        } else if (reason === 'מניה גלובלית' || reason === 'קרן סל עולמית') {
            reasonBadge = `<span class="suggestion-reason global-badge">${reason}</span>`;
        } else {
            reasonBadge = `<span class="suggestion-reason">${reason}</span>`;
        }

        item.innerHTML = `
            <div class="suggestion-info">
                <div class="suggestion-ticker-row">
                    <span class="suggestion-ticker">${stock.ticker}</span>
                    ${reasonBadge}
                </div>
                <span class="suggestion-name">${stock.name}</span>
            </div>
            <span class="suggestion-price">${priceInfo}</span>
        `;
        
        item.onclick = () => {
            document.getElementById('tip-ticker').value = stock.ticker;
            dropdown.style.display = 'none';
            tipSuggestionFocusIndex = -1;
        };
        
        dropdown.appendChild(item);
    });
}

function handleTipTickerKeyDown(e) {
    const dropdown = document.getElementById('tip-ticker-suggestions');
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.getElementsByClassName('suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        tipSuggestionFocusIndex++;
        if (tipSuggestionFocusIndex >= items.length) {
            tipSuggestionFocusIndex = 0;
        }
        updateTipSuggestionFocus(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        tipSuggestionFocusIndex--;
        if (tipSuggestionFocusIndex < 0) {
            tipSuggestionFocusIndex = items.length - 1;
        }
        updateTipSuggestionFocus(items);
    } else if (e.key === 'Enter') {
        if (tipSuggestionFocusIndex >= 0 && tipSuggestionFocusIndex < items.length) {
            e.preventDefault();
            items[tipSuggestionFocusIndex].click();
        }
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        tipSuggestionFocusIndex = -1;
    }
}

function updateTipSuggestionFocus(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('focused');
    }

    if (tipSuggestionFocusIndex >= 0 && tipSuggestionFocusIndex < items.length) {
        const activeItem = items[tipSuggestionFocusIndex];
        activeItem.classList.add('focused');
        
        activeItem.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }
}


function openTransactionModal() {
    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    
    document.getElementById('tx-summary-cash').textContent = formatCurrency(activePortfolio.cash_balance || 0);
    document.getElementById('transaction-modal').classList.add('active');
    
    document.getElementById('tx-ticker').value = '';
    document.getElementById('tx-qty').value = '';
    document.getElementById('tx-price').value = '';
    updateMarketPriceHint('');
    
    suggestionFocusIndex = -1;
    const dropdown = document.getElementById('ticker-suggestions');
    if (dropdown) dropdown.style.display = 'none';

    document.getElementById('act-holding').checked = true;
    toggleModalFields();
}

let searchDebounceTimeout = null;

function handleTickerSearch(e) {
    const term = e.target.value.trim().toLowerCase();
    const dropdown = document.getElementById('ticker-suggestions');
    
    if (!dropdown) return;
    
    // איפוס בחירת פוקוס
    suggestionFocusIndex = -1;
    
    if (!term) {
        dropdown.style.display = 'none';
        return;
    }
    
    // 1. שלב א': חיפוש סמנטי מקומי מיידי (מהיר וללא שום השהייה!)
    const localMatches = getLocalSemanticMatches(term);
    renderSuggestions(localMatches, dropdown);
    
    // 2. שלב ב': חיפוש גלובלי חי בבורסת ארה"ב (דיבונס של 300 מילישניות למניעת ספאם)
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        if (term.length < 2) return;
        const globalMatches = await fetchGlobalLiveMatches(term);
        // מיזוג תוצאות ומניעת כפילויות
        const mergedMatches = mergeSearchMatches(localMatches, globalMatches);
        renderSuggestions(mergedMatches, dropdown);
    }, 300);
}

function getLocalSemanticMatches(term) {
    const matches = [];
    
    SEMANTIC_STOCK_DATABASE.forEach(stock => {
        let score = 0;
        let reason = '';
        
        const ticker = stock.ticker.toLowerCase();
        const name = stock.name.toLowerCase();
        
        if (ticker === term) {
            score = 100;
            reason = 'סימול מדויק';
        } else if (ticker.startsWith(term)) {
            score = 90;
            reason = 'מתחיל בסימול';
        } else if (ticker.includes(term)) {
            score = 80;
            reason = 'מכיל סימול';
        } else if (name.includes(term)) {
            score = 70;
            reason = 'שם החברה';
        } else {
            // חיפוש סמנטי במילות מפתח ( keywords )
            const matchingKeyword = stock.keywords.find(keyword => keyword.toLowerCase().includes(term));
            if (matchingKeyword) {
                score = 50;
                reason = `מתאים ל: ${matchingKeyword}`;
            }
        }
        
        if (score > 0) {
            matches.push({ stock, score, reason });
        }
    });
    
    // מיון לפי רלוונטיות
    matches.sort((a, b) => b.score - a.score);
    return matches;
}

async function fetchGlobalLiveMatches(term) {
    try {
        const data = await API.marketSearch(term);
        return (data.quotes || []).map(q => ({
            stock: {
                ticker: q.symbol.toUpperCase(),
                name: q.name || `${q.symbol} Corp.`,
                keywords: []
            },
            score: 60,
            reason: q.quoteType === 'ETF' ? 'קרן סל עולמית' : 'מניה גלובלית'
        }));
    } catch (e) {
        console.error('Error fetching global live search matches:', e);
    }
    return [];
}

function mergeSearchMatches(local, global) {
    const merged = [...local];
    
    global.forEach(gMatch => {
        // הימנעות מכפילויות על בסיס הטיקר
        const exists = merged.some(lMatch => lMatch.stock.ticker.toUpperCase() === gMatch.stock.ticker.toUpperCase());
        if (!exists) {
            merged.push(gMatch);
        }
    });
    
    // מיון סופי לפי הציון
    merged.sort((a, b) => b.score - a.score);
    return merged;
}

function renderSuggestions(matches, dropdown) {
    dropdown.innerHTML = '';
    
    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.style.display = 'flex';
    
    matches.forEach(match => {
        const stock = match.stock;
        const reason = match.reason;
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        
        const priceInfo = MOCK_STOCK_PRICES[stock.ticker] ? `$${MOCK_STOCK_PRICES[stock.ticker].price.toFixed(2)}` : 'שער חי';
        
        // יצירת תגית מותאמת אישית לסיבת ההתאמה
        let reasonBadge = '';
        if (reason === 'סימול מותאם אישית') {
            reasonBadge = `<span class="suggestion-reason custom-badge">${reason}</span>`;
        } else if (reason === 'סימול מדויק' || reason === 'מתחיל בסימול' || reason === 'מכיל סימול') {
            reasonBadge = `<span class="suggestion-reason ticker-badge">${reason}</span>`;
        } else if (reason === 'מניה גלובלית' || reason === 'קרן סל עולמית') {
            reasonBadge = `<span class="suggestion-reason global-badge">${reason}</span>`;
        } else {
            reasonBadge = `<span class="suggestion-reason">${reason}</span>`;
        }

        item.innerHTML = `
            <div class="suggestion-info">
                <div class="suggestion-ticker-row">
                    <span class="suggestion-ticker">${stock.ticker}</span>
                    ${reasonBadge}
                </div>
                <span class="suggestion-name">${stock.name}</span>
            </div>
            <span class="suggestion-price">${priceInfo}</span>
        `;
        
        item.onclick = async () => {
            document.getElementById('tx-ticker').value = stock.ticker;
            document.getElementById('tx-price').value = '';
            updateMarketPriceHint(stock.ticker);
            await fetchSingleLivePrice(stock.ticker);
            calculateModalTotal();
            dropdown.style.display = 'none';
            suggestionFocusIndex = -1;
            document.getElementById('tx-qty').focus();
        };
        
        dropdown.appendChild(item);
    });
}

function handleTickerKeyDown(e) {
    const dropdown = document.getElementById('ticker-suggestions');
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.getElementsByClassName('suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        suggestionFocusIndex++;
        if (suggestionFocusIndex >= items.length) {
            suggestionFocusIndex = 0;
        }
        updateSuggestionFocus(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        suggestionFocusIndex--;
        if (suggestionFocusIndex < 0) {
            suggestionFocusIndex = items.length - 1;
        }
        updateSuggestionFocus(items);
    } else if (e.key === 'Enter') {
        if (suggestionFocusIndex >= 0 && suggestionFocusIndex < items.length) {
            e.preventDefault();
            items[suggestionFocusIndex].click();
        }
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        suggestionFocusIndex = -1;
    }
}

function updateSuggestionFocus(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('focused');
    }

    if (suggestionFocusIndex >= 0 && suggestionFocusIndex < items.length) {
        const activeItem = items[suggestionFocusIndex];
        activeItem.classList.add('focused');
        
        activeItem.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }
}

function updateMarketPriceHint(ticker) {
    const hintEl = document.getElementById('tx-market-price-hint');
    if (!hintEl) return;
    const sym = (ticker || '').trim().toUpperCase();
    if (!sym) {
        hintEl.textContent = 'שער שוק נוכחי: — (מתעדכן אוטומטית מהבורסה)';
        return;
    }
    const quote = MOCK_STOCK_PRICES[sym];
    if (quote && quote.price > 0) {
        hintEl.innerHTML = `שער שוק נוכחי: <strong style="color:var(--accent-blue-start)">${formatCurrency(quote.price)}</strong> (סנכרון חי — לעיון בלבד)`;
    } else {
        hintEl.textContent = `שער שוק נוכחי: טוען נתונים עבור ${sym}...`;
    }
}

async function fetchSingleLivePrice(ticker) {
    try {
        const stock = await fetchTickerChartData(ticker);
        if (stock) {
            const symbol = stock.ticker;
            let price = stock.price;
            const change = stock.change;
            
            if (price !== undefined && price !== null && price > 0) {
                if (symbol.endsWith('.TA')) {
                    let priceInIls = price;
                    if (stock.currency === 'ILA' || stock.currency === 'GBp' || price > 1000) {
                        priceInIls = price / 100;
                    }
                    price = priceInIls / usdToIlsRate;
                }
                
                MOCK_STOCK_PRICES[symbol] = {
                    name: stock.name,
                    price: price,
                    change: change
                };
                
                try {
                    localStorage.setItem('market_stock_prices', JSON.stringify(MOCK_STOCK_PRICES));
                } catch(e) {
                    console.error("Failed to save single live price to localStorage:", e);
                }
                
                const currentInputTicker = document.getElementById('tx-ticker').value.trim().toUpperCase();
                if (currentInputTicker === ticker.toUpperCase()) {
                    updateMarketPriceHint(symbol);
                    showToast(`שער שוק עדכני ל-${symbol}: ${formatCurrency(price)}`, 'success');
                }
            } else {
                updateMarketPriceHint(ticker);
                showToast(`לא ניתן למשוך שער תקין עבור ${symbol}.`, 'warning');
            }
        }
    } catch (e) {
        console.error('Error fetching single live price:', e);
    }
}

function closeTransactionModal() {
    document.getElementById('transaction-modal').classList.remove('active');
}

function toggleModalFields() {
    const actionType = document.querySelector('input[name="action_type"]:checked').value;
    const tickerGroup = document.getElementById('modal-ticker-group');
    const qtyGroup = document.getElementById('modal-qty-group');
    const priceLabel = document.getElementById('tx-price-label');
    const priceInput = document.getElementById('tx-price');
    const tickerInput = document.getElementById('tx-ticker');
    const qtyInput = document.getElementById('tx-qty');
    const marketHint = document.getElementById('tx-market-price-hint');
    const cashRow = document.getElementById('tx-summary-fee-row');

    if (actionType === 'deposit' || actionType === 'withdraw') {
        tickerGroup.style.display = 'none';
        qtyGroup.style.display = 'none';
        if (marketHint) marketHint.style.display = 'none';
        if (cashRow) cashRow.style.display = 'flex';
        priceLabel.textContent = 'סכום פעולה ($)';
        priceInput.placeholder = 'הזן סכום במזומן (אופציונלי)';
        tickerInput.required = false;
        qtyInput.required = false;
    } else {
        tickerGroup.style.display = 'flex';
        qtyGroup.style.display = 'flex';
        if (marketHint) marketHint.style.display = 'block';
        if (cashRow) cashRow.style.display = 'none';
        if (actionType === 'sell') {
            priceLabel.textContent = 'מחיר מכירה ($)';
            priceInput.placeholder = 'הזן את שער המכירה';
        } else {
            priceLabel.textContent = 'מחיר קנייה ממוצע ($)';
            priceInput.placeholder = 'הזן את מחיר הקנייה הממוצע שלך';
        }
        tickerInput.required = true;
        qtyInput.required = true;
    }
    calculateModalTotal();
}

function calculateModalTotal() {
    const actionType = document.querySelector('input[name="action_type"]:checked').value;
    const qty = parseFloat(document.getElementById('tx-qty').value) || 0;
    const price = parseFloat(document.getElementById('tx-price').value) || 0;
    const totalEl = document.getElementById('tx-summary-total');

    if (actionType === 'deposit' || actionType === 'withdraw') {
        totalEl.textContent = formatCurrency(price);
    } else {
        totalEl.textContent = formatCurrency(qty * price);
    }
}

async function handleTransactionSubmit(event) {
    event.preventDefault();

    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];

    const actionType = document.querySelector('input[name="action_type"]:checked').value;
    const ticker = document.getElementById('tx-ticker').value.trim().toUpperCase();
    const qty = parseFloat(document.getElementById('tx-qty').value) || 0;
    const price = parseFloat(document.getElementById('tx-price').value) || 0;

    const metrics = calculatePortfolioMetrics(activePortfolio.id);

    if (actionType === 'sell') {
        const holding = metrics.holdingsMap[ticker];
        if (!holding || holding.quantity < qty) {
            const availableQty = holding ? holding.quantity.toFixed(4).replace(/\.?0+$/, '') : '0';
            showToast(`אין ברשותך מספיק מניות! כמות זמינה: ${availableQty} מניות של ${ticker}`, 'error');
            return;
        }
    }

    try {
        await API.createTransaction({
            portfolio_id: activePortfolio.id,
            ticker: (actionType === 'deposit' || actionType === 'withdraw') ? null : ticker,
            action_type: actionType,
            quantity: (actionType === 'deposit' || actionType === 'withdraw') ? 0 : qty,
            price,
            transaction_date: new Date().toISOString()
        });

        await loadUserData();
        closeTransactionModal();

        if (activeView === 'dashboard') renderCharts();
        else if (activeView === 'transactions') renderTransactionsTable();

        showToast('הפעולה תועדה ונרשמה בהצלחה בתיק המעקב!', 'success');
    } catch (e) {
        showToast(e.message || 'שגיאה בשמירת העסקה', 'error');
    }
}

// ==================== 9. יועץ השקעות AI - סינונים וצ'אט ====================
function updateAIHealthScore() {
    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    const metrics = calculatePortfolioMetrics(activePortfolio.id);
    
    let score = 100;
    let description = '';

    const holdingTickers = Object.keys(metrics.holdingsMap);
    const numHoldings = holdingTickers.length;

    const cashPct = metrics.total_estimated_value > 0 ? (metrics.cash_balance / metrics.total_estimated_value) * 100 : 100;

    if (numHoldings === 0) {
        score = 50;
        description = 'התיק ריק ממניות. בצע רכישות של מניות מגוונות לקבלת ניתוח בריאות מלא של ה-AI.';
    } else {
        if (numHoldings === 1) {
            score -= 25;
            description += 'סיכון ריכוזיות גבוה: התיק שלך מחזיק במניה אחת בלבד. ';
        } else if (numHoldings === 2) {
            score -= 15;
            description += 'ביזור נמוך: התיק מחזיק ב-2 מניות בלבד. שקול לפזר נכסים בסקטורים נוספים. ';
        } else if (numHoldings >= 4) {
            score += 5;
        }

        if (cashPct === 0) {
            score -= 15;
            description += 'אין כרית ביטחון: התיק מושקע במלואו במניות ללא יתרת מזומן נזילה לניצול הזדמנויות. ';
        } else if (cashPct > 40) {
            score -= 10;
            description += 'יעילות הון נמוכה: יש לך מעל 40% מזומן שאינו מושקע (Cash Drag), דבר הפוגע בתשואה לטווח ארוך. ';
        } else {
            description += 'חלוקת המזומן ורשת הביטחון שלך מצוינים. ';
        }

        let highConcentrationTicker = '';
        let maxPct = 0;
        for (const ticker in metrics.holdingsMap) {
            const pct = (metrics.holdingsMap[ticker].market_value / metrics.total_estimated_value) * 100;
            if (pct > 45) {
                highConcentrationTicker = ticker;
                maxPct = pct;
            }
        }

        if (highConcentrationTicker) {
            score -= 15;
            description += `חשיפת יתר מסוכנת: מניית ${highConcentrationTicker} מהווה ${maxPct.toFixed(0)}% מהתיק שלך. מומלץ לא לחצות את רף ה-25% במניה בודדת.`;
        }

        if (score >= 85) {
            description = 'בריאות תיק מצוינת! התיק מבוזר היטב עם יתרת מזומן בריאה למסחר וביצועים יציבים. המשך כך!';
        } else if (score >= 70 && !description.includes('סיכון')) {
            description = 'בריאות תיק טובה. ביזור סביר עם רמת סיכון מתונה. ניתן לשפר מעט על ידי פיזור בסקטורים משלימים.';
        }
    }

    score = Math.max(30, Math.min(100, score));

    document.getElementById('health-score-value').textContent = score;
    document.getElementById('health-score-desc').textContent = description;

    const circleRing = document.getElementById('score-ring');
    const radius = circleRing.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    circleRing.style.strokeDashoffset = offset;
    
    if (score >= 85) circleRing.style.stroke = 'var(--pos-green)';
    else if (score >= 70) circleRing.style.stroke = 'var(--warning-gold)';
    else circleRing.style.stroke = 'var(--neg-red)';
}

function renderAITips() {
    const tipsListEl = document.getElementById('ai-tips-list');
    
    tipsListEl.innerHTML = '';

    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    const metrics = calculatePortfolioMetrics(activePortfolio.id);
    const holdingTickers = [...PortfolioEngine.getPortfolioTickerSet(metrics.holdingsMap)];
    const filteredTips = PortfolioEngine.filterTipsForPortfolio(allTips, holdingTickers);

    if (filteredTips.length === 0) {
        tipsListEl.innerHTML = '<p class="text-muted" style="font-size: 0.8rem; text-align: center;">אין המלצות זמינות כרגע.</p>';
        return;
    }

    filteredTips.forEach(tip => {
        const div = document.createElement('div');
        div.className = 'tip-item';

        const recommender = tip.recommender || (tip.id === 't5' || tip.id === 't6' ? 'ai' : 'avi');
        const isGeneral = tip.ticker === null;
        
        let titleText = '';
        let iconName = '';
        let iconColorClass = '';
        
        if (recommender === 'ai') {
            titleText = isGeneral ? 'בוט AI' : `בוט AI — המלצה ל-${tip.ticker}`;
            iconName = 'psychology';
            iconColorClass = 'purple';
        } else {
            titleText = isGeneral ? 'אבי' : `אבי — המלצה ל-${tip.ticker}`;
            iconName = 'person';
            iconColorClass = 'green';
        }

        div.innerHTML = `
            <div class="tip-icon ${iconColorClass}">
                <span class="material-icons-round">${iconName}</span>
            </div>
            <div class="tip-content">
                <span class="tip-title">${titleText}</span>
                <span class="tip-desc">${tip.content}</span>
            </div>
        `;
        tipsListEl.appendChild(div);
    });
}

// צ'אט AI
const chatMessages = [];

function initAIChat() {
    // איפוס הודעות והתאמה אישית של פניית ה-AI עם שם המשתמש הנוכחי
    chatMessages.length = 0;
    chatMessages.push({ 
        sender: 'ai', 
        text: `שלום ${currentUser.name}! אני יועץ ההשקעות מבוסס ה-AI של PortfolioPulse. אני מנתח את הרכב התיק שלך, יתרת המזומן והפעולות שלך בזמן אמת כדי לתת לך המלצות מבוססות נתונים. על מה תרצה להתייעץ היום?` 
    });
    
    renderChatMessages();
    renderSuggestedPrompts();
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    container.innerHTML = '';
    chatMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender}`;
        div.innerHTML = msg.text;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function renderSuggestedPrompts() {
    const container = document.getElementById('suggested-prompts');
    if (!container) return;

    if (portfolios.length === 0) return;
    const activePortfolio = portfolios[0];
    const metrics = calculatePortfolioMetrics(activePortfolio.id);
    const holdingTickers = Object.keys(metrics.holdingsMap);
    
    const prompts = [
        { text: 'האם התיק שלי מבוזר מספיק?', value: 'diversification' },
        { text: 'כיצד מומלץ לחלק את המזומן שלי?', value: 'cash' }
    ];

    if (holdingTickers.length > 0) {
        const firstTicker = holdingTickers[0];
        prompts.push({ text: `מה דעתך על מניית ${firstTicker}?`, value: `stock_${firstTicker}` });
    } else {
        prompts.push({ text: 'אילו מניות מומלצות כרגע לרכישה?', value: 'recs' });
    }

    container.innerHTML = '';
    prompts.forEach(p => {
        const button = document.createElement('button');
        button.className = 'suggest-btn';
        button.textContent = p.text;
        button.onclick = () => handleSuggestedClick(p.text, p.value);
        container.appendChild(button);
    });
}

async function handleSuggestedClick(text, value) {
    chatMessages.push({ sender: 'user', text: text });
    renderChatMessages();
    showAIChatTypingIndicator();

    try {
        const reply = await generateAIResponse(value, text);
        removeAIChatTypingIndicator();
        chatMessages.push({ sender: 'ai', text: reply });
    } catch (e) {
        removeAIChatTypingIndicator();
        chatMessages.push({ sender: 'ai', text: `אירעה שגיאה בעיבוד הבקשה: ${e.message}` });
    }
    renderChatMessages();
    renderSuggestedPrompts();
}

async function handleSendMessage(event) {
    event.preventDefault();
    const inputEl = document.getElementById('chat-input-text');
    const text = inputEl.value.trim();
    
    if (!text) return;

    chatMessages.push({ sender: 'user', text: text });
    renderChatMessages();
    inputEl.value = '';
    showAIChatTypingIndicator();

    try {
        const reply = await generateAIResponse('user_query', text);
        removeAIChatTypingIndicator();
        chatMessages.push({ sender: 'ai', text: reply });
    } catch (e) {
        removeAIChatTypingIndicator();
        chatMessages.push({ sender: 'ai', text: `מתנצל, אירעה שגיאה בחיבור לשרת השערים. אנא נסה שוב.` });
    }
    renderChatMessages();
}

function showAIChatTypingIndicator() {
    const container = document.getElementById('chat-messages-container');
    const div = document.createElement('div');
    div.className = 'message ai typing-indicator-wrapper';
    div.id = 'ai-typing-indicator';
    div.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function removeAIChatTypingIndicator() {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();
}

async function generateAIResponse(value, userRawText = '') {
    if (portfolios.length === 0) return 'לא נמצא תיק השקעות פעיל לשליפת נתונים.';
    const activePortfolio = portfolios[0];
    const metrics = calculatePortfolioMetrics(activePortfolio.id);
    const holdingTickers = Object.keys(metrics.holdingsMap);
    const cashValue = metrics.cash_balance;
    const cashPct = metrics.total_estimated_value > 0 ? ((cashValue / metrics.total_estimated_value) * 100).toFixed(1) : '100';

    const text = (userRawText || '').toLowerCase();
    
    // 1. Check if the user is asking about the general market, indexes or global analysis
    const isGlobalMarketQuery = text.includes('שוק') || text.includes('מדד') || text.includes('מדדים') || 
                                text.includes('סנופי') || text.includes('s&p') || text.includes('nasdaq') || 
                                text.includes('נאסדאק') || text.includes('דאו ג') || text.includes('dji') || 
                                text.includes('גלובל') || text.includes('אינפלציה') || text.includes('ריבית') || 
                                text.includes('כלכלה') || text.includes('כלכלי') || text.includes('התפתחויות') ||
                                text.includes('סקטור') || text.includes('להיכנס') || text.includes('להיזהר') ||
                                text.includes('אזהרה') || text.includes('סכנה') || text.includes('להימנע') ||
                                text.includes('ממה כדאי') || value === 'market';

    // 2. Check if the user is asking about diversification or cash or general portfolio tips
    const isDiversificationQuery = value === 'diversification' || text.includes('פיזור') || text.includes('מבוזר') || text.includes('ביזור');
    const isCashQuery = value === 'cash' || text.includes('מזומן') || text.includes('כסף פנוי');
    const isPortfolioQuery = text.includes('התיק שלי') || text.includes('החזקות') || text.includes('ביצועים') || text.includes('תשואה') || text.includes('רווח');

    if (isGlobalMarketQuery) {
        try {
            // Fetch live index prices
            const indexTickers = ['^GSPC', '^IXIC', '^DJI'];
            const response = await API.marketPrices(indexTickers);
            const prices = response.prices || {};
            
            let gspcInfo = prices['^GSPC'] || { price: 5300, change: 0.25 };
            let ixicInfo = prices['^IXIC'] || { price: 16800, change: 0.45 };
            let djiInfo = prices['^DJI'] || { price: 39000, change: -0.10 };

            const formatChange = (change) => {
                if (change === undefined || change === null) return '—';
                const sign = change >= 0 ? '+' : '';
                const color = change >= 0 ? 'var(--pos-green)' : 'var(--neg-red)';
                return `<span style="color: ${color}; font-family: var(--font-numbers); font-weight: bold;">${sign}${change.toFixed(2)}%</span>`;
            };

            let reply = `🌎 <strong>יעוץ השקעות LIVE — סקירת כלכלה עולמית וסקטורים:</strong><br><br>`;
            reply += `📊 <strong>מצב מדדי השוק הגלובליים בזמן אמת:</strong><br>`;
            reply += `• <strong>S&P 500 (${gspcInfo.name || 'מדד S&P 500'}):</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(gspcInfo.price)}</span> | שינוי יומי: ${formatChange(gspcInfo.change)}<br>`;
            reply += `• <strong>Nasdaq (${ixicInfo.name || 'מדד נאסדאק'}):</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(ixicInfo.price)}</span> | שינוי יומי: ${formatChange(ixicInfo.change)}<br>`;
            reply += `• <strong>Dow Jones (${djiInfo.name || 'מדד דאו ג׳ונס'}):</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(djiInfo.price)}</span> | שינוי יומי: ${formatChange(djiInfo.change)}<br><br>`;
            
            reply += `📉 <strong>1. מצב כלכלי גלובלי והתפתחויות משמעותיות:</strong><br>`;
            reply += `השוק העולמי נמצא תחת השפעה ישירה של מדיניות הריבית של הפד (Federal Reserve) ותהליכי הירידה באינפלציה. מדד הנאסדא"ק וה-S&P 500 מציגים תנודתיות אך שומרים על מומנטום חיובי בעקבות ביצועים פיננסיים יוצאי דופן של ענקיות הטכנולוגיה. מלחמת המחירים בתחום ה-AI והמעבר העולמי לענן מייצרים רוח גבית משמעותית.<br><br>`;
            
            reply += `🚀 <strong>2. סקטורים מומלצים לכניסה והזדמנויות:</strong><br>`;
            reply += `• <strong>תשתיות טכנולוגיה ו-AI (Hardware & Semiconductors):</strong> חברות המייצרות שבבים ומפתחות תשתית ענן (כגון NVDA, MSFT) הן הבסיס למהפכה הבאה. הביקוש נשאר קשיח.<br>`;
            reply += `• <strong>סייבר אבטחת מידע (Cybersecurity):</strong> סקטור חסין מיתון לחלוטין. תקציבי האבטחה הדיגיטלית של ארגונים ממשיכים לגדול בקצב דו-ספרתי.<br>`;
            reply += `• <strong>תשתיות אנרגיה חכמה ורשתות חשמל (Smart Utilities):</strong> מהפכת ה-AI דורשת כמויות חשמל אדירות עבור מרכזי נתונים (Data Centers). חברות ייצור אנרגיה וציוד רשת נהנות מצמיחה ארוכת טווח.<br><br>`;
            
            reply += `⚠️ <strong>3. ממה כדאי להיזהר וסקטורים בסיכון:</strong><br>`;
            reply += `• <strong>נדל"ן מסחרי ומשרדים (Commercial Real Estate):</strong> סקטור ממונף מאוד הסובל מהמשך הריביות הגבוהות ושינוי הרגלי העבודה (עבודה מהבית). מומלץ להימנע מחברות עם יחסי חוב גבוהים.<br>`;
            reply += `• <strong>קמעונאות וצריכה בסיכון אשראי (Consumer Finance):</strong> סקטורים הרגישים מאוד לגידול בפיגורי אשראי צרכני בארה"ב. היזהרו מחברות מימון חוץ-בנקאי קטנות.<br>`;
            reply += `• <strong>מניות 'הייפ' ללא תזרים מזומנים חופשי:</strong> בתקופה של עלויות גיוס חוב גבוהות, חברות צמיחה שלא מציגות רווחיות ברורה (Free Cash Flow) נוטות לקרוס תחת נטל הריבית.`;
            
            return reply;
        } catch (e) {
            console.error("Error generating dynamic market response:", e);
            return `🌎 <strong>ניתוח כלכלי גלובלי וסקטוריאלי:</strong><br><br>השווקים הגלובליים מראים יציבות יחסית. להלן הנחיות ה-AI העדכניות לתיק שלך:<br><br>🚀 <strong>סקטורים מומלצים:</strong> טכנולוגיית AI, סייבר אבטחת מידע, ואנרגיה ירוקה התומכת בשרתי נתונים.<br><br>⚠️ <strong>סקטורים בסיכון שיש להיזהר מהם:</strong> נדל"ן מסחרי ממונף, חברות מימון צרכני, ומניות צמיחה קטנות ללא תזרים מזומנים רווחי.`;
        }
    }

    if (isDiversificationQuery) {
        const num = holdingTickers.length;
        if (num === 0) {
            return `התיק שלך מורכב כרגע מ-100% מזומן פנוי בסך ${formatCurrency(cashValue)}. <br><br>כדי להתחיל לבזר את התיק וליצור רווחים, מומלץ לבחור 3-4 מניות מובילות מסקטורים שונים (כמו טכנולוגיה, פיננסים וצריכה) ולהשקיע בהן חלק מהמזומן הזמין.`;
        }
        
        let reply = `⚖️ <strong>ניתוח פיזור וביזור תיק ההשקעות שלך (${num} נכסים):</strong><br><ul>`;
        
        if (num <= 2) {
            reply += `<li><strong>רמת ביזור נמוכה מאוד:</strong> התיק שלך חשוף ל-${num} מניות בלבד (${holdingTickers.join(', ')}). הדבר מגדיל משמעותית את סיכון התיק. מומלץ להתרחב ל-4-5 מניות לפחות מסקטורים שונים.</li>`;
        } else {
            reply += `<li><strong>פיזור מניות:</strong> יש לך פיזור בריא ותקין של מניות בין ${num} חברות.</li>`;
        }

        let maxHolding = { ticker: '', pct: 0 };
        metrics.holdingsList.forEach(holding => {
            const pct = metrics.total_estimated_value > 0 ? (holding.market_value / metrics.total_estimated_value) * 100 : 0;
            if (pct > maxHolding.pct) {
                maxHolding = { ticker: holding.ticker, pct: pct };
            }
        });

        if (maxHolding.pct > 40) {
            reply += `<li><strong>ריכוזיות יתר:</strong> מניית <strong>${maxHolding.ticker}</strong> מהווה כ-<strong>${maxHolding.pct.toFixed(1)}%</strong> משווי התיק הכולל. זוהי חשיפת יתר שמגדילה את רמת הסיכון. שקול לאזן את התיק (Rebalancing).</li>`;
        } else {
            reply += `<li><strong>איזון משקולות:</strong> האחזקה הגדולה ביותר שלך היא ${maxHolding.ticker} (${maxHolding.pct.toFixed(0)}%), וזהו משקל מצוין לניהול סיכונים חכם.</li>`;
        }

        reply += `</ul>ציון בריאות התיק הנוכחי שלך לפי ה-AI הוא <strong>${document.getElementById('health-score-value')?.textContent || '85'} נקודות</strong>.`;
        return reply;
    }

    if (isCashQuery) {
        if (cashValue === 0) {
            return `💸 יתרת המזומן שלך עומדת על <strong>${formatCurrency(0)}</strong> (100% מושקע במניות).<br><br>השקעה מלאה היא מצוינת לעיתות שוק עולה, אך היא משאירה אותך ללא נזילות לניצול הזדמנויות. מומלץ להפקיד סכום מזומן נוסף או לשקול מימוש חלקי ליצירת עתודת מזומן של כ-10%-15%.`;
        }

        if (parseFloat(cashPct) > 40) {
            return `💵 יתרת המזומן שלך גדולה במיוחד ועומדת על <strong>${formatCurrency(cashValue)}</strong> (${cashPct}% מהתיק).<br><br>מזומן רב שוכב ללא תשואה נשחק בגלל אינפלציה (Cash Drag). המלצת ה-AI היא לבצע רכישות הדרגתיות של מניות ערך יציבות כמו MSFT או AAPL כדי להפעיל את ההון שלך בשוק בצורה מושכלת.`;
        }

        return `💵 יתרת המזומן שלך עומדת על <strong>${formatCurrency(cashValue)}</strong> (${cashPct}% מהתיק).<br><br>זהו יחס מעולה וקלאסי! רזרבת מזומנים של 10%-15% מעניקה לך גמישות מושלמת לרכישת מניות מפתח במידה ויהיו תיקוני שערים כלפי מטה, מבלי לפגוע בליבת ההשקעות שלך.`;
    }

    if (isPortfolioQuery) {
        let reply = `💼 <strong>סיכום וביצועי תיק ההשקעות האישי שלך (PortfolioPulse AI):</strong><br><br>`;
        reply += `• <strong>שווי תיק כולל:</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(metrics.total_estimated_value)}</span><br>`;
        reply += `• <strong>יתרת מזומן זמינה:</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(metrics.cash_balance)}</span> (${cashPct}%)<br>`;
        reply += `• <strong>שווי שוק מניות:</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(metrics.totalStockMarketValue)}</span><br>`;
        
        const sign = metrics.totalPnL >= 0 ? '+' : '';
        const colorClass = metrics.totalPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
        reply += `• <strong>תשואת מניות כוללת (רווח/הפסד):</strong> <span class="${colorClass}" style="font-family: var(--font-numbers); font-weight: bold;">${sign}${metrics.totalPnLPct.toFixed(2)}% (${formatCurrency(metrics.totalPnL)})</span><br><br>`;
        
        if (holdingTickers.length > 0) {
            reply += `📈 <strong>הרכב אחזקות עיקריות בתיק:</strong><br>`;
            metrics.holdingsList.forEach(h => {
                const stockPnLSign = (h.pnl || 0) >= 0 ? '+' : '';
                const stockColor = (h.pnl || 0) >= 0 ? 'var(--pos-green)' : 'var(--neg-red)';
                reply += `- <strong>${h.ticker}:</strong> כמות: ${h.quantity.toFixed(2)} | שווי: ${formatCurrency(h.market_value)} (תשואה: <span style="color: ${stockColor}; font-weight: bold;">${stockPnLSign}${(h.pnl_pct || 0).toFixed(2)}%</span>)<br>`;
            });
        } else {
            reply += `אין לך מניות מוחזקות כרגע בתיק. באפשרותך ללחוץ על כפתור "תיעוד פעולה" כדי להוסיף אחזקה ראשונה.`;
        }

        return reply;
    }

    if (value === 'recs' || text.includes('המלצות') || text.includes('רכישה') || text.includes('לקנות')) {
        return `🎯 <strong>מניות מומלצות למעקב ורכישה בתיק מבוזר:</strong><br><br>1. <strong>MSFT (Microsoft):</strong> מובילה עולמית בענן ובאינטגרציית AI יצרנית (Copilot). מניית איכות יציבה וסולידית.<br>2. <strong>GOOGL (Alphabet):</strong> נסחרת במכפיל רווח נוח יותר ממתחרותיה ומציגה צמיחה עקבית בפרסום וב-Google Cloud.<br>3. <strong>AAPL (Apple):</strong> עוגן פיננסי מעולה עם יתרות מזומנים אדירות ותוכניות רכישה חוזרת של מניות שמגינות על ערך החברה.<br>4. <strong>אפשרויות מקומיות:</strong> מדד ת"א 125 לרכישת סל מניות ישראליות מגוון.`;
    }

    // 3. Search and fetch details for ANY stock in the world
    let searchTerm = '';
    
    // Hebrew company map
    const HEBREW_TO_TICKER_MAP = {
        'אפל': 'AAPL', 'אנבידיה': 'NVDA', 'טסלה': 'TSLA', 'מיקרוסופט': 'MSFT', 'גוגל': 'GOOGL',
        'אמזון': 'AMZN', 'מטא': 'META', 'פייסבוק': 'META', 'נטפליקס': 'NFLX', 'דיסני': 'DIS',
        'אינטל': 'INTC', 'אייאמדי': 'AMD', 'אלפבית': 'GOOGL', 'קוקה קולה': 'KO', 'פפסי': 'PEP',
        'נייק': 'NKE', 'נייקי': 'NKE', 'סטארבקס': 'SBUX', 'ברקשייר': 'BRK-B', 'בנק אוף אמריקה': 'BAC',
        'גייפי מורגן': 'JPM', 'טבע': 'TEVA', 'סנופי': '^GSPC', 'נאסדאק': '^IXIC', 'דאו גונס': '^DJI',
        'שבבים': 'SOXX', 'פלנטיר': 'PLTR', 'ניו': 'NIO', 'עליבאבא': 'BABA', 'ספוטיפיי': 'SPOT',
        'פייפאל': 'PYPL', 'אדובי': 'ADBE', 'סיילספורס': 'CRM', 'צק פוינט': 'CHKP', 'פאלו אלטו': 'PANW',
        'נובו נורדיסק': 'NVO', 'אלי לילי': 'LLY', 'קטרפילר': 'CAT', 'שברון': 'CVX', 'ביטקוין': 'BTC-USD',
        'אתריום': 'ETH-USD', 'לאומי': 'LUMI.TA', 'פועלים': 'POLI.TA', 'דיסקונט': 'DSCT.TA',
        'מזרחי': 'MZTF.TA', 'נייס': 'NICE', 'אלביט': 'ESLT', 'קמטק': 'CAMT', 'נובה': 'NVMI'
    };

    for (const key in HEBREW_TO_TICKER_MAP) {
        if (text.includes(key)) {
            searchTerm = HEBREW_TO_TICKER_MAP[key];
            break;
        }
    }

    if (!searchTerm) {
        const match = userRawText.match(/\b([a-zA-Z\^\.]{2,7})\b/);
        if (match) {
            searchTerm = match[1].toUpperCase();
        }
    }

    if (!searchTerm && text.length > 2) {
        const genericWords = ['שלום', 'תגיד', 'כמה', 'דעתך', 'מניית', 'מהו', 'מחיר', 'רווח', 'הפסד', 'לגבי', 'מניה', 'מניות', 'עושה', 'חושב', 'שעכשיו', 'עכשיו', 'אנליזה', 'ניתוח', 'עליה', 'עליהם'];
        const words = userRawText.split(/\s+/).map(w => w.replace(/[^\w\u0590-\u05fe]/g, '')).filter(w => w.length > 1 && !genericWords.includes(w.toLowerCase()));
        if (words.length > 0) {
            words.sort((a, b) => b.length - a.length);
            searchTerm = words[0];
        }
    }

    if (searchTerm) {
        try {
            const searchRes = await API.marketSearch(searchTerm);
            const quotes = searchRes.quotes || [];
            
            if (quotes.length > 0) {
                const bestQuote = quotes[0];
                const ticker = bestQuote.symbol.toUpperCase();
                const priceRes = await API.marketPrices([ticker]);
                const stockInfo = priceRes.prices[ticker];
                
                if (stockInfo) {
                    const priceVal = stockInfo.price;
                    const changeVal = stockInfo.change;
                    const holding = metrics.holdingsList.find(h => h.ticker === ticker);
                    
                    let reply = `🔍 <strong>ניתוח מניית ${ticker} (${stockInfo.name || bestQuote.name}) בזמן אמת:</strong><br><br>`;
                    reply += `• <strong>מחיר שוק עדכני:</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(priceVal)}</span><br>`;
                    
                    const sign = changeVal >= 0 ? '+' : '';
                    const color = changeVal >= 0 ? 'var(--pos-green)' : 'var(--neg-red)';
                    reply += `• <strong>שינוי יומי:</strong> <span style="color: ${color}; font-family: var(--font-numbers); font-weight: bold;">${sign}${changeVal.toFixed(2)}%</span><br>`;
                    
                    if (holding) {
                        const stockPnLSign = holding.pnl >= 0 ? '+' : '';
                        const stockPnLColor = holding.pnl >= 0 ? 'var(--pos-green)' : 'var(--neg-red)';
                        reply += `• <strong>אחזקה בתיק שלך:</strong> ${holding.quantity.toFixed(2)} מניות בשווי של <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(holding.market_value)}</span><br>`;
                        reply += `• <strong>שער קנייה ממוצע שלך:</strong> <span style="font-family: var(--font-numbers); font-weight: bold;">${formatCurrency(holding.avg_buy_price)}</span><br>`;
                        reply += `• <strong>תשואה מהקנייה:</strong> <span style="color: ${stockPnLColor}; font-weight: bold;">${stockPnLSign}${holding.pnl_pct.toFixed(2)}% (${formatCurrency(holding.pnl)})</span><br>`;
                    } else {
                        reply += `• <strong>בתיק שלך:</strong> אינך מחזיק במניה זו כרגע.<br>`;
                    }
                    
                    reply += `<br>💡 <strong>ניתוח וחוות דעת AI (מנוע PortfolioPulse):</strong><br>`;
                    if (ticker === 'AAPL') {
                        reply += `מניית אפל מציגה יציבות ורמת נזילות פנומנלית. היא משמשת כעוגן סולידי מצוין לתיק. רמת סיכון נמוכה. מומלץ להחזיק.`;
                    } else if (ticker === 'NVDA') {
                        reply += `מניית מובילת שבבי ה-AI. צמיחת החברה מרשימה אך מכפיל הרווח גבוה מאוד ומזמין תנודתיות. מומלץ להחזיק, ולבצע רכישות חדשות רק בתיקוני שוק.`;
                    } else if (ticker === 'TSLA') {
                        reply += `טסלה נסחרת בתנודתיות גבוהה המאפיינת מניית צמיחה ספקולטיבית. חשיפה בריאה צריכה לעמוד על כ-5% לכל היותר מתיק ההשקעות שלך.`;
                    } else {
                        reply += `מניית **${ticker}** הינה בעלת פרופיל פיננסי מעניין. מומלץ לנתח את הדוחות הכספיים האחרונים של החברה ולבחון את מכפיל הרווח (P/E) ביחס למתחרותיה בענף. בתיק מבוזר היטב, מומלץ כי החזקה בודדת במנייה זו לא תעבור את ה-10% מהשווי הכולל.`;
                    }
                    return reply;
                }
            }
        } catch (e) {
            console.error("Error searching live stock details:", e);
        }
    }

    return `שלום! קיבלתי את פנייתך: "${userRawText}". <br><br>כיועץ השקעות AI של PortfolioPulse, אני יכול לעזור לך במגוון נושאים:<br>` +
           `• <strong>שאל אותי על כל מניה בעולם:</strong> הקלד שם של חברה או סימול (למשל: "מה מצב מניית MSFT?", "אמזון", "Intel").<br>` +
           `• <strong>בקש ניתוח שוק גלובלי:</strong> הקלד "ניתוח שוק" או "מה מצב המדדים?".<br>` +
           `• <strong>התייעץ על הרכב התיק שלך:</strong> הקלד "האם התיק מבוזר?", "מה לעשות עם המזומן?".`;
}


// ==================== 10. לוגיקה ייעודית עבור מנהל ויועץ (Advisor / Admin Console Engine) ====================

// א. חישוב דאשבורד מנהל (AUM, לקוחות וטיפים)
function refreshAdminCalculations() {
    const clients = allUsers.filter(u => u.role === 'client');
    
    let totalAUM = 0;
    const clientRowsData = [];

    clients.forEach(client => {
        // מציאת תיק הלקוח
        const portfolio = portfolios.find(p => p.user_id === client.id);
        let cashBalance = 0;
        let totalValue = 0;
        let stocksCount = 0;

        if (portfolio) {
            // שימוש בפונקציה המודולרית לחישוב שווי התיק העדכני של הלקוח!
            const metrics = calculatePortfolioMetrics(portfolio.id);
            cashBalance = metrics.cash_balance;
            totalValue = calculateTotalEquity(portfolio.id);
            stocksCount = metrics.holdingsList.length;
            totalAUM += totalValue;
        }

        clientRowsData.push({
            id: client.id,
            name: client.name,
            email: client.email,
            cash: cashBalance,
            stocksCount: stocksCount,
            totalValue: totalValue
        });
    });

    // עדכון מדדים בדף המנהל
    document.getElementById('admin-val-aum').textContent = formatCurrency(totalAUM);
    document.getElementById('admin-val-clients').textContent = clients.length;
    document.getElementById('admin-val-tips').textContent = allTips.length;
    document.getElementById('admin-clients-count').textContent = `${clients.length} לקוחות`;

    // רינדור טבלת הלקוחות בדאשבורד המנהל
    const tableBody = document.getElementById('admin-clients-table-body');
    tableBody.innerHTML = '';

    clientRowsData.forEach(row => {
        const tr = document.createElement('tr');
        const firstLetter = row.name.charAt(0);

        tr.innerHTML = `
            <td>
                <div class="client-name-badge">
                    <div class="client-avatar">${firstLetter}</div>
                    <span class="user-name">${row.name}</span>
                </div>
            </td>
            <td class="stock-ticker" style="font-size: 0.85rem; font-weight: normal; color: var(--text-secondary);">${row.email}</td>
            <td>${formatCurrency(row.cash)}</td>
            <td><span class="badge-outline" style="border-color: rgba(255,255,255,0.1);">${row.stocksCount} מניות</span></td>
            <td class="summary-total">${formatCurrency(row.totalValue)}</td>
            <td>
                <button class="btn btn-primary btn-outline" style="padding: 6px 12px; font-size: 0.8rem; border-radius: var(--radius-sm);" onclick="viewClientPortfolio('${row.id}')">
                    <span class="material-icons-round" style="font-size: 16px;">visibility</span>
                    <span>צפה בתיק הלקוח</span>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// ב. מסך צפייה בתיק לקוח ספציפי (Client Portfolio Viewer)
function viewClientPortfolio(clientId) {
    const client = allUsers.find(u => u.id === clientId);
    const portfolio = portfolios.find(p => p.user_id === clientId);

    if (!client || !portfolio) {
        showToast('שגיאה בטעינת נתוני לקוח!', 'error');
        return;
    }

    // מעבר לטאב מפרט לקוח
    switchView('client-detail');

    // עדכון כותרות
    document.getElementById('detail-client-name').textContent = client.name;

    // חישוב מדדי הלקוח
    const metrics = calculatePortfolioMetrics(portfolio.id);

    // מילוי מדדים
    document.getElementById('detail-total-portfolio').textContent = formatCurrency(calculateTotalEquity(portfolio.id));
    document.getElementById('detail-cash-balance').textContent = formatCurrency(metrics.cash_balance);
    
    const pnlEl = document.getElementById('detail-total-pnl');
    const pnlIconEl = document.getElementById('detail-pnl-icon');

    if (metrics.totalPnL >= 0) {
        pnlEl.textContent = `+${formatCurrency(metrics.totalPnL)} (+${metrics.totalPnLPct.toFixed(2)}%)`;
        pnlEl.className = 'metric-value pnl-positive';
        pnlIconEl.textContent = 'trending_up';
        pnlIconEl.className = 'material-icons-round metric-icon green';
    } else {
        pnlEl.textContent = `-${formatCurrency(Math.abs(metrics.totalPnL))} (${metrics.totalPnLPct.toFixed(2)}%)`;
        pnlEl.className = 'metric-value pnl-negative';
        pnlIconEl.textContent = 'trending_down';
        pnlIconEl.className = 'material-icons-round metric-icon red';
    }

    renderHoldingsTableInto(
        document.getElementById('detail-holdings-table-body'),
        metrics.holdingsList,
        'אין מניות מוחזקות בתיק זה.'
    );

    // רינדור טבלת עסקאות הלקוח
    const txBody = document.getElementById('detail-transactions-table-body');
    txBody.innerHTML = '';

    metrics.transactions.sort((a,b) => new Date(b.transaction_date) - new Date(a.transaction_date));

    if (metrics.transactions.length === 0) {
        txBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">טרם בוצעו עסקאות.</td></tr>';
    } else {
        metrics.transactions.forEach(tx => {
            const tr = document.createElement('tr');
            const formattedDate = new Date(tx.transaction_date).toLocaleString('he-IL', {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            });

            let typeText = '';
            let typeClass = '';
            let total = 0;

            if (tx.action_type === 'buy') {
                typeText = 'קנייה';
                typeClass = 'buy';
                total = tx.quantity * tx.price;
            } else if (tx.action_type === 'holding') {
                typeText = 'הוספת אחזקה';
                typeClass = 'buy';
                total = tx.quantity * tx.price;
            } else if (tx.action_type === 'sell') {
                typeText = 'מכירה';
                typeClass = 'sell';
                total = tx.quantity * tx.price;
            } else if (tx.action_type === 'deposit') {
                typeText = 'הפקדה';
                typeClass = 'deposit';
                total = tx.price;
            } else {
                typeText = 'משיכה';
                typeClass = 'withdraw';
                total = tx.price;
            }

            tr.innerHTML = `
                <td class="tx-date">${formattedDate}</td>
                <td><span class="tx-badge ${typeClass}">${typeText}</span></td>
                <td class="stock-ticker">${tx.ticker || '—'}</td>
                <td>${tx.quantity > 0 ? tx.quantity : '—'}</td>
                <td>${formatCurrency(tx.price)}</td>
                <td class="summary-total" style="font-size:0.95rem;">${formatCurrency(total)}</td>
            `;
            txBody.appendChild(tr);
        });
    }

    // רינדור גרף הנכסים של הלקוח
    renderDetailChart(metrics);
}

function renderDetailChart(metrics) {
    const ctx = document.getElementById('detailAssetsDoughnutChart');
    const emptyState = document.getElementById('detail-chart-empty-state');
    
    if (!ctx) return;

    const labels = ['מזומן פנוי'];
    const data = [metrics.cash_balance];
    const backgroundColors = ['rgba(182, 33, 255, 0.7)'];
    const hoverBackgroundColors = ['rgba(182, 33, 255, 0.9)'];

    const stockColorPalette = [
        'rgba(0, 242, 254, 0.7)',
        'rgba(0, 230, 118, 0.7)',
        'rgba(255, 179, 0, 0.7)',
        'rgba(255, 23, 68, 0.7)',
        'rgba(43, 97, 163, 0.7)'
    ];

    let colorIdx = 0;
    let hasStocks = false;

    metrics.holdingsList.forEach(holding => {
        if (holding.quantity > 0) {
            hasStocks = true;
            labels.push(holding.ticker);
            data.push(holding.market_value);
            
            const color = stockColorPalette[colorIdx % stockColorPalette.length];
            backgroundColors.push(color);
            hoverBackgroundColors.push(color.replace('0.7', '0.9'));
            colorIdx++;
        }
    });

    if (metrics.cash_balance === 0 && !hasStocks) {
        ctx.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    ctx.style.display = 'block';
    emptyState.style.display = 'none';

    if (detailChartInstance) {
        detailChartInstance.destroy();
    }

    detailChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                hoverBackgroundColor: hoverBackgroundColors,
                borderWidth: 1.5,
                borderColor: '#0f131a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Rubik', size: 10 }, usePointStyle: true }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((value / total) * 100).toFixed(1);
                            return ` ${context.label}: ${formatCurrency(value)} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// ג. מערכת ניהול טיפים (מנהל/יועץ)
function renderAdminTipsList() {
    const listContainer = document.getElementById('admin-tips-list');
    const countBadge = document.getElementById('admin-tips-count');

    countBadge.textContent = `${allTips.length} פעילים`;
    listContainer.innerHTML = '';

    if (allTips.length === 0) {
        listContainer.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">אין טיפים פעילים במערכת. צור טיפ חדש משמאל.</p>';
        return;
    }

    // מיון לפי תאריך יורד
    allTips.sort((a,b) => new Date(b.date) - new Date(a.date));

    allTips.forEach(tip => {
        const div = document.createElement('div');
        div.className = 'tip-item';

        const isGeneral = tip.ticker === null;
        const tagText = isGeneral ? 'כללי' : tip.ticker;
        const tagClass = isGeneral ? 'general' : 'stock';

        const recommender = tip.recommender || 'avi';
        const recommenderText = recommender === 'ai' ? 'בוט AI' : 'אבי';
        const recommenderClass = recommender === 'ai' ? 'recommender-ai' : 'recommender-avi';
        const recommenderIcon = recommender === 'ai' ? 'psychology' : 'person';

        div.innerHTML = `
            <div class="tip-content">
                <div class="tip-author-header ${recommenderClass}">
                    <span class="material-icons-round" style="font-size: 16px;">${recommenderIcon}</span>
                    <span class="tip-author-name">${recommenderText}</span>
                </div>
                <div class="flex-between" style="margin-top: 6px;">
                    <span class="tip-tag ${tagClass}">${tagText}</span>
                    <span class="text-muted" style="font-size:0.75rem;">${tip.date}</span>
                </div>
                <p class="tip-desc" style="margin-top: 8px; font-size: 0.85rem; color: var(--text-primary);">${tip.content}</p>
            </div>
            <button class="btn-delete-tip" onclick="handleDeleteTip('${tip.id}')" title="מחק המלצה">
                <span class="material-icons-round" style="font-size:18px;">delete</span>
            </button>
        `;
        listContainer.appendChild(div);
    });
}

function toggleTipFormFields() {
    const isStock = document.getElementById('tip-type-stock').checked;
    const tickerGroup = document.getElementById('tip-ticker-group');
    const tickerInput = document.getElementById('tip-ticker');

    if (isStock) {
        tickerGroup.style.display = 'flex';
        tickerInput.required = true;
    } else {
        tickerGroup.style.display = 'none';
        tickerInput.required = false;
        tickerInput.value = '';
    }
}

async function handleCreateTipSubmit(event) {
    event.preventDefault();
    const isStock = document.getElementById('tip-type-stock').checked;
    const ticker = document.getElementById('tip-ticker').value.trim().toUpperCase();
    const content = document.getElementById('tip-content').value.trim();
    const recommender = document.getElementById('tip-author-ai').checked ? 'ai' : 'avi';

    if (isStock && !ticker) {
        showToast('נא להזין סימול מניה עבור המלצה ספציפית!', 'error');
        return;
    }

    try {
        await API.createTip(isStock ? ticker : null, content, recommender);
        const data = await API.getTips();
        allTips = data.tips || [];

        document.getElementById('tip-content').value = '';
        document.getElementById('tip-ticker').value = '';
        document.getElementById('tip-type-general').checked = true;
        document.getElementById('tip-author-avi').checked = true;
        toggleTipFormFields();

        renderAdminTipsList();
        document.getElementById('admin-val-tips').textContent = allTips.length;
        showToast('המלצה חדשה פורסמה במערכת וזמינה ללקוחות קצה!', 'success');
    } catch (e) {
        showToast(e.message || 'שגיאה בפרסום ההמלצה', 'error');
    }
}

async function handleDeleteTip(tipId) {
    try {
        await API.deleteTip(tipId);
        allTips = allTips.filter(t => t.id !== tipId);
        renderAdminTipsList();
        document.getElementById('admin-val-tips').textContent = allTips.length;
        showToast('ההמלצה נמחקה ממסד הנתונים בהצלחה.', 'success');
    } catch (e) {
        showToast(e.message || 'שגיאה במחיקה', 'error');
    }
}

// ==================== 11. עזרים גלובליים ====================
function formatCurrency(value) {
    if (value === null || value === undefined) {
        return 'טרם סונכרן / שגיאה';
    }
    const valNum = parseFloat(value);
    if (isNaN(valNum)) return '—';
    if (displayCurrency === 'ILS') {
        const converted = valNum * usdToIlsRate;
        return '₪' + converted.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });
    }
    return '$' + valNum.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    });
}

function toggleDisplayCurrency() {
    displayCurrency = displayCurrency === 'USD' ? 'ILS' : 'USD';
    const toggleBtn = document.getElementById('currency-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = displayCurrency === 'USD' ? 'USD ($)' : 'ILS (₪)';
        toggleBtn.style.color = displayCurrency === 'USD' ? 'var(--accent-blue-start)' : 'var(--pos-green)';
    }
    
    // טעינה מחדש של נתוני המשתמש והרצת החישובים העדכניים במטבע הנבחר
    loadUserData();
    
    // עדכון גרפים וחזותיות בהתאם
    if (activeView === 'dashboard') {
        renderCharts();
    } else if (activeView === 'client-detail') {
        const viewingBadge = document.querySelector('#detail-client-name');
        if (viewingBadge) {
            const clientName = viewingBadge.textContent;
            const client = allUsers.find(u => u.name === clientName);
            if (client) {
                viewClientPortfolio(client.id);
            }
        }
    }
    
    showToast(`מטבע התצוגה שונה בהצלחה ל-${displayCurrency === 'USD' ? 'דולר ($)' : 'שקלים (₪)'}!`, 'success');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check_circle';
    if (type === 'error') iconName = 'warning';

    toast.innerHTML = `
        <span class="material-icons-round">${iconName}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}
