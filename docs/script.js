// Bot durumu ve istatistikleri
let botStatus = {
    online: false,
    servers: 0,
    users: 0,
    uptime: 0,
    memory: 0,
    ping: 0,
    lastUpdate: new Date()
};

// API Base URL - GitHub Pages için statik
const API_BASE = 'https://your-bot-api.herokuapp.com'; // Buraya gerçek API URL'nizi koyun

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    updateBotStatus();
    setInterval(updateBotStatus, 30000); // 30 saniyede bir güncelle
    updateLastUpdateTime();
    setInterval(updateLastUpdateTime, 1000); // Her saniye güncelle
});

// Bot durumunu güncelle
async function updateBotStatus() {
    try {
        // Gerçek API'ye bağlanmaya çalış
        const response = await fetch(`${API_BASE}/api/status`);
        
        if (response.ok) {
            const data = await response.json();
            botStatus = { ...botStatus, ...data };
            updateUI();
        } else {
            throw new Error('API bağlantısı başarısız');
        }
    } catch (error) {
        console.log('API bağlantısı yok, demo data kullanılıyor');
        updateDemoData();
    }
}

// Demo data (API olmadığında)
function updateDemoData() {
    // Gerçekçi demo değerler
    const isOnline = Math.random() > 0.2; // %80 online şansı
    
    botStatus.online = isOnline;
    botStatus.servers = isOnline ? Math.floor(Math.random() * 25) + 15 : 0;
    botStatus.users = isOnline ? Math.floor(Math.random() * 800) + 400 : 0;
    botStatus.uptime = isOnline ? Math.floor(Math.random() * 172800) + 3600 : 0; // 1-48 saat
    botStatus.memory = isOnline ? Math.floor(Math.random() * 150) + 80 : 0; // 80-230 MB
    botStatus.ping = isOnline ? Math.floor(Math.random() * 100) + 20 : 0; // 20-120 ms
    botStatus.lastUpdate = new Date();
    
    updateUI();
}

// UI'ı güncelle
function updateUI() {
    // Status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusCard = document.getElementById('statusCard');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusDescription = document.getElementById('statusDescription');
    const lastCheck = document.getElementById('lastCheck');
    
    if (botStatus.online) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Çevrimiçi';
        statusCard.className = 'status-card online';
        statusIcon.className = 'fas fa-circle';
        statusTitle.textContent = 'Bot Aktif';
        statusDescription.textContent = 'Bot şu anda çevrimiçi ve komutları işliyor.';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Çevrimdışı';
        statusCard.className = 'status-card offline';
        statusIcon.className = 'fas fa-circle';
        statusTitle.textContent = 'Bot Çevrimdışı';
        statusDescription.textContent = 'Bot şu anda çevrimdışı. Lütfen daha sonra tekrar deneyin.';
    }
    
    lastCheck.textContent = `Son kontrol: ${new Date().toLocaleTimeString('tr-TR')}`;
    
    // Stats
    document.getElementById('serverCount').textContent = botStatus.servers.toLocaleString();
    document.getElementById('userCount').textContent = botStatus.users.toLocaleString();
    document.getElementById('uptime').textContent = formatUptime(botStatus.uptime);
    document.getElementById('memoryUsage').textContent = botStatus.memory > 0 ? `${botStatus.memory} MB` : '-';
    document.getElementById('botPing').textContent = botStatus.ping > 0 ? `${botStatus.ping} ms` : '-';
}

// Uptime formatla
function formatUptime(seconds) {
    if (seconds === 0) return '-';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}g ${hours}s`;
    } else if (hours > 0) {
        return `${hours}s ${minutes}d`;
    } else {
        return `${minutes}d`;
    }
}

// Son güncelleme zamanını güncelle
function updateLastUpdateTime() {
    const now = new Date();
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
        lastUpdate.textContent = now.toLocaleString('tr-TR');
    }
}

// Sayfa görünürlüğü değiştiğinde
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Sayfa tekrar görünür olduğunda durumu güncelle
        updateBotStatus();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+R ile sayfayı yenile
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        updateBotStatus();
        showNotification('Veriler yenilendi!', 'success');
    }
});

// Bildirim göster
function showNotification(message, type = 'info') {
    // Basit bildirim sistemi
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'success') {
        notification.style.background = '#4CAF50';
    } else if (type === 'error') {
        notification.style.background = '#f44336';
    } else {
        notification.style.background = '#2196F3';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// CSS animasyonları ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Lazy loading for images
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Performance monitoring
window.addEventListener('load', function() {
    if ('performance' in window) {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log(`Sayfa yükleme süresi: ${loadTime}ms`);
    }
});

// Error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript hatası:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise hatası:', e.reason);
});