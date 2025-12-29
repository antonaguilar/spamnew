// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded');
    initializeModeButtons();
    setupKeepAlive();
});

function setupKeepAlive() {
    // Ping server every 4 minutes to prevent timeout on free tier
    setInterval(function() {
        fetch('/api/health').catch(err => console.log('Keep-alive ping'));
    }, 4 * 60 * 1000);
}

function initializeModeButtons() {
    console.log('Setting up mode buttons');
    const modeBtns = document.querySelectorAll('.mode-btn');
    
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Mode clicked:', this.getAttribute('data-mode'));
            
            modeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const mode = this.getAttribute('data-mode');
            document.getElementById('shareMode').value = mode;
            
            if (mode === 'fast') {
                document.getElementById('workersGroup').style.display = 'block';
                document.getElementById('delayGroup').style.display = 'none';
            } else {
                document.getElementById('workersGroup').style.display = 'none';
                document.getElementById('delayGroup').style.display = 'block';
            }
        });
    });
}

async function sharePost() {
    console.log('=== sharePost called ===');
    
    const linkInput = document.getElementById('linkToPost').value.trim();
    const cookieInput = document.getElementById('cookie').value.trim();
    const countInput = parseInt(document.getElementById('shareCount').value);
    const modeInput = document.getElementById('shareMode').value;
    const maxWorkersInput = Math.min(parseInt(document.getElementById('maxWorkers').value), 3);
    const shareDelayInput = Math.max(parseFloat(document.getElementById('shareDelay').value), 0.5);
    
    console.log('Inputs:', { linkInput, countInput, modeInput });
    
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('status');
    const shareBtn = document.getElementById('shareBtn');
    const resultContainer = document.getElementById('resultContainer');
    const statsDiv = document.getElementById('stats');

    // Validation
    if (!linkInput) {
        showResult('❌ Please enter a link', 'error');
        return;
    }
    if (!cookieInput) {
        showResult('❌ Please enter a cookie', 'error');
        return;
    }
    if (!countInput || countInput < 1) {
        showResult('❌ Enter a valid share count', 'error');
        return;
    }

    shareBtn.disabled = true;
    resultContainer.style.display = 'block';
    resultDiv.textContent = '';
    resultDiv.className = '';
    statsDiv.innerHTML = '';
    statusDiv.innerHTML = '<span class="loading-spinner"></span> Converting cookie to token...';
    statusDiv.classList.add('active');

    try {
        console.log('Converting cookie...');
        const tokenResponse = await fetch('/api/convert-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookie: cookieInput }),
            signal: AbortSignal.timeout(15000)
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.token) {
            showResult(`❌ Token Error: ${tokenData.error}`, 'error');
            shareBtn.disabled = false;
            statusDiv.classList.remove('active');
            return;
        }

        const token = tokenData.token;
        console.log('Token received');
        
        const modeText = modeInput === 'fast' ? '⚡ Fast Mode' : '🐢 Slow Mode';
        statusDiv.innerHTML = `<span class="loading-spinner"></span> ${modeText}: Sharing ${countInput} times...`;

        const shareResponse = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                link: linkInput,
                cookie: cookieInput,
                token: token,
                count: countInput,
                mode: modeInput,
                maxWorkers: maxWorkersInput,
                shareDelay: shareDelayInput
            }),
            signal: AbortSignal.timeout(120000) // 2 minute timeout
        });

        const shareData = await shareResponse.json();

        if (!shareResponse.ok) {
            showResult(`❌ ${shareData.error}`, 'error');
        } else {
            showResult(`✅ ${shareData.message}`, 'success');
        }

        displayStats(shareData.success_count || 0, shareData.failed_count || 0);
        statusDiv.innerHTML = `<strong>✓ Done!</strong> Success: ${shareData.success_count || 0} | Failed: ${shareData.failed_count || 0}`;

    } catch (error) {
        console.error('Error:', error);
        const errorMsg = error.name === 'AbortError' ? 'Request timeout' : error.message;
        showResult(`❌ ${errorMsg}`, 'error');
    } finally {
        shareBtn.disabled = false;
    }
}

function showResult(message, type) {
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = message;
    resultDiv.className = type;
}

function displayStats(successCount, failedCount) {
    const statsDiv = document.getElementById('stats');
    statsDiv.innerHTML = `
        <div class="stat-box success">
            <div class="stat-label">✓ Successful</div>
            <div class="stat-value">${successCount}</div>
        </div>
        <div class="stat-box error">
            <div class="stat-label">✗ Failed</div>
            <div class="stat-value">${failedCount}</div>
        </div>
    `;
}

function clearForm() {
    document.getElementById('linkToPost').value = '';
    document.getElementById('cookie').value = '';
    document.getElementById('shareCount').value = '1';
    document.getElementById('maxWorkers').value = '3';
    document.getElementById('shareDelay').value = '0.5';
    document.getElementById('resultContainer').style.display = 'none';
    document.getElementById('result').textContent = '';
    document.getElementById('result').className = '';
    document.getElementById('status').textContent = '';
    document.getElementById('status').classList.remove('active');
    document.getElementById('stats').innerHTML = '';
}


