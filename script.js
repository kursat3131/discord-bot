// Bot durumu ve istatistikleri
let botStatus = {
    online: false,
    servers: 0,
    users: 0,
    uptime: 0,
    memory: 0,
    lastUpdate: new Date()
};

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
        // Bot durumunu kontrol et (API endpoint'i)
        const response = await fetch('/api/status');
        
        if (response.ok) {
            const data = await response.json();
            botStatus = { ...botStatus, ...data };
            updateUI();
        } else {
            // API yoksa mock data kullan
            updateMockData();
        }
    } catch (error) {
        console.log('API bağlantısı yok, mock data kullanılıyor');
        updateMockData();
    }
}

// Mock data (API olmadığında)
function updateMockData() {
    // Rastgele değerler oluştur (demo için)
    botStatus.online = Math.random() > 0.3; // %70 online şansı
    botStatus.servers = Math.floor(Math.random() * 50) + 10;
    botStatus.users = Math.floor(Math.random() * 1000) + 500;
    botStatus.uptime = Math.floor(Math.random() * 86400) + 3600; // 1-24 saat arası
    botStatus.memory = Math.floor(Math.random() * 200) + 50; // 50-250 MB
    botStatus.lastUpdate = new Date();
    
    updateUI();
}

// UI'ı güncelle
function updateUI() {
    // Status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (botStatus.online) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Çevrimiçi';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Çevrimdışı';
    }
    
    // Stats
    document.getElementById('serverCount').textContent = botStatus.servers.toLocaleString();
    document.getElementById('userCount').textContent = botStatus.users.toLocaleString();
    document.getElementById('uptime').textContent = formatUptime(botStatus.uptime);
    document.getElementById('memoryUsage').textContent = `${botStatus.memory} MB`;
}

// Uptime formatla
function formatUptime(seconds) {
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
    lastUpdate.textContent = now.toLocaleString('tr-TR');
}

// Bot kontrolü
async function controlBot(action) {
    const button = event.target;
    const originalText = button.innerHTML;
    
    // Loading state
    button.innerHTML = '<div class="loading"></div> İşleniyor...';
    button.disabled = true;
    
    try {
        // API çağrısı yap
        const response = await fetch(`/api/control/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showMessage(result.message || `Bot ${action} işlemi başarılı!`, 'success');
            
            // Durumu güncelle
            setTimeout(updateBotStatus, 2000);
        } else {
            throw new Error('API hatası');
        }
    } catch (error) {
        // Mock response (API olmadığında)
        setTimeout(() => {
            const messages = {
                start: 'Bot başlatılıyor... (Demo modu)',
                stop: 'Bot durduruluyor... (Demo modu)',
                restart: 'Bot yeniden başlatılıyor... (Demo modu)'
            };
            
            showMessage(messages[action] || 'İşlem tamamlandı (Demo modu)', 'info');
            
            // Mock status update
            if (action === 'start') {
                botStatus.online = true;
            } else if (action === 'stop') {
                botStatus.online = false;
            }
            updateUI();
        }, 1500);
    }
    
    // Button'u eski haline getir
    setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
    }, 2000);
}

// Mesaj göster
function showMessage(text, type = 'info') {
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    const controlPanel = document.querySelector('.control-panel');
    controlPanel.appendChild(message);
    
    // 5 saniye sonra kaldır
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 5000);
}

// Logları göster
async function showLogs() {
    const modal = document.getElementById('logsModal');
    const logsContent = document.getElementById('logsContent');
    
    modal.style.display = 'block';
    logsContent.textContent = 'Loglar yükleniyor...';
    
    try {
        const response = await fetch('/api/logs');
        
        if (response.ok) {
            const logs = await response.text();
            logsContent.textContent = logs;
        } else {
            throw new Error('API hatası');
        }
    } catch (error) {
        // Mock logs (API olmadığında)
        const mockLogs = `[${new Date().toISOString()}] [INFO] Bot kursat_bey#1425 is online!
[${new Date().toISOString()}] [INFO] Successfully logged in to Discord
[${new Date().toISOString()}] [INFO] Music command executed by user#1234
[${new Date().toISOString()}] [INFO] Watch party created: test-video
[${new Date().toISOString()}] [INFO] YouTube Together activity started
[${new Date().toISOString()}] [INFO] Chat command executed with Gemini AI
[${new Date().toISOString()}] [WARN] Rate limit approached for user#5678
[${new Date().toISOString()}] [INFO] Volume set to 75%
[${new Date().toISOString()}] [INFO] Bot joined voice channel: General
[${new Date().toISOString()}] [INFO] Music playback started: Imagine Dragons - Believer

--- Demo Modu Aktif ---
Gerçek loglar için API bağlantısı gereklidir.`;
        
        logsContent.textContent = mockLogs;
    }
}

// Logları kapat
function closeLogs() {
    document.getElementById('logsModal').style.display = 'none';
}

// Modal dışına tıklanınca kapat
window.onclick = function(event) {
    const modal = document.getElementById('logsModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // ESC tuşu ile modal'ı kapat
    if (e.key === 'Escape') {
        closeLogs();
    }
    
    // Ctrl+R ile sayfayı yenile
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        updateBotStatus();
        showMessage('Veriler yenilendi!', 'success');
    }
});

// Sayfa görünürlüğü değiştiğinde
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Sayfa tekrar görünür olduğunda durumu güncelle
        updateBotStatus();
    }
});

// Service Worker (offline support)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}