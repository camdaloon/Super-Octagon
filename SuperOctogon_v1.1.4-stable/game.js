const cvs = document.getElementById('gameCanvas');
const ctx = cvs.getContext('2d');
const menuOverlay = document.getElementById('menuOverlay');
const hud = document.getElementById('hud');
const scoreB = document.getElementById('score');
const bestB = document.getElementById('best');
const titleText = document.getElementById('titleText');
const diffLabel = document.getElementById('difficultyLabel');
const statsPanel = document.getElementById('statsPanel');
const verStamp = document.getElementById('ver');
const pauseScreen = document.getElementById('pauseScreen');
const muteStatus = document.getElementById('muteStatus');
const controlHints = document.getElementById('controlHints');

const creatorSplash = document.getElementById('creatorSplash');
const gameLoading = document.getElementById('gameLoading');
const uiLayer = document.getElementById('ui');
const progressBar = document.getElementById('loadingProgressBar');

const SIDES = 8, P_DIST = 60, P_SIZE = 7;
let state = 'BOOT', score = 0, keys = {}, pAng = 0, wRot = 0, targetWRot = 0, rDir = 1, lastRot = 0, walls = [], spawnT = 0, pulseT = 0, spd = 1;
let lastTime = 0;
let gameOverTime = 0;

let currentCenterRadius = 44;
let targetCenterRadius = 44;
let globalHue = 280; 
let invertFlashTimer = 0;
let invertState = false;

let userClickedToStart = false;
let bootTimer = 0;
let loadingProgress = 0;

let shakeIntensity = 0;
let audioCtx = null;
let currentMusicTrack = null; 
let isMuted = false;

const tracks = {
    main: null,
    normal: null,
    hard: null,
    octagon: null
};

const DIFF_KEYS = ['normal', 'hard', 'octagon'];
let diffIdx = 0;

const CFG = { 
    normal: [3.6, 0.02, 125, "NORMAL"], 
    hard: [5.2, 0.031, 95, "HARD"], 
    octagon: [6.8, 0.044, 70, "OCTAGON"] 
};

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e){}
    
    tracks.main = new Audio('music/main.mp3');
    tracks.normal = new Audio('music/normal.mp3');
    tracks.hard = new Audio('music/hard.mp3');
    tracks.octagon = new Audio('music/octagon.mp3');
    
    for (let key in tracks) {
        if (tracks[key]) {
            tracks[key].loop = true;
            tracks[key].preload = 'auto';
        }
    }
    
    tracks.main.addEventListener('canplaythrough', () => {
        if ((state === 'MENU' || state === 'GAMEOVER') && !currentMusicTrack) {
            playMenuMusic();
        }
    }, { once: true });

    updateMuteVolume();
    if (state === 'MENU' || state === 'GAMEOVER') playMenuMusic();
}

window.addEventListener('click', () => {
    if (!userClickedToStart) {
        userClickedToStart = true;
        initAudio();
    }
});

function playTone(freq, type, duration, vol, delay = 0) {
    if (!audioCtx || isMuted) return;
    setTimeout(() => {
        try {
            let osc = audioCtx.createOscillator();
            let gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            
            // Fixed: Doubled the incoming volume multiplier (vol * 2.0) so laser booms and clicks pop out!
            gain.gain.setValueAtTime(vol * 2.0, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch(e){}
    }, delay * 1000);
}

function loadAndPlayMusic(diffName) {
    stopMusic(); 
    if (tracks.main) tracks.main.pause();
    
    currentMusicTrack = tracks[diffName];
    if (currentMusicTrack) {
        updateMuteVolume();
        currentMusicTrack.play().catch(e => console.log("Audio deferred:", e));
    }
}

function stopMusic() {
    if (currentMusicTrack) {
        currentMusicTrack.pause();
        currentMusicTrack.currentTime = 0; 
        currentMusicTrack = null;
    }
}

function playMenuMusic() {
    if (tracks.main && !isMuted) {
        updateMuteVolume();
        tracks.main.play().catch(e => console.log("Menu audio deferred:", e));
    }
}

function toggleMute() {
    isMuted = !isMuted;
    updateMuteVolume();
    if (isMuted) {
        muteStatus.innerText = "MUTED";
        muteStatus.style.color = "#ff0055";
        controlHints.innerText = "PRESS [P] TO PAUSE | PRESS [M] TO UNMUTE";
    } else {
        muteStatus.innerText = "PRESS [M] TO MUTE";
        muteStatus.style.color = "#666";
        controlHints.innerText = "PRESS [P] TO PAUSE | PRESS [M] TO MUTE";
    }
}

function updateMuteVolume() {
    // Fixed: Set music volume to 0.45 when active so it doesn't drown out the sound effects
    let vol = isMuted ? 0 : 0.45; 
    for (let key in tracks) {
        if (tracks[key]) tracks[key].volume = vol;
    }
}


function resize() { cvs.width = window.innerWidth; cvs.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'm') { toggleMute(); initAudio(); return; }
    initAudio(); 
    
    if (state === 'MENU' || state === 'GAMEOVER') {
        if (state === 'GAMEOVER' && Date.now() - gameOverTime < 1000) return; 
        if (k === 'arrowleft' || k === 'a') { changeDiff(-1); playTone(440, 'triangle', 0.1, 0.1); }
        if (k === 'arrowright' || k === 'd') { changeDiff(1); playTone(523, 'triangle', 0.1, 0.1); }
        if (e.key === ' ') startG();
    } else if (state === 'PLAYING' && k === 'p') {
        state = 'PAUSED';
        menuOverlay.style.display = 'none';
        pauseScreen.classList.remove('hidden');
        if (currentMusicTrack) currentMusicTrack.pause(); 
    } else if (state === 'PAUSED' && k === 'p') {
        state = 'PLAYING';
        pauseScreen.classList.add('hidden');
        if (currentMusicTrack) currentMusicTrack.play(); 
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const getHi = (d) => parseFloat(localStorage.getItem('so_h_' + d)) || 0;

function updateMenuUI() {
    const d = DIFF_KEYS[diffIdx];
    const c = CFG[d]; 
    diffLabel.innerText = c[3];
    if (state === 'GAMEOVER' || score > 0) {
        statsPanel.innerHTML = `LAST RUN: <b style="color:#00ffcc">${score.toFixed(2)}s</b> &nbsp;|&nbsp; BEST RECORD: <b style="color:#fff">${getHi(d).toFixed(2)}s</b>`;
    } else {
        statsPanel.innerHTML = `Personal Best Record: <b style="color:#fff">${getHi(d).toFixed(2)}s</b>`;
    }
}

function changeDiff(dir) {
    diffIdx = (diffIdx + dir + DIFF_KEYS.length) % DIFF_KEYS.length;
    targetWRot += dir * (Math.PI * 2 / SIDES);
    titleText.innerText = "SUPER OCTAGON"; 
    updateMenuUI();
}

function startG() {
    menuOverlay.style.display = 'none'; footerDock.style.display = 'none'; hud.style.display = 'flex'; state = 'PLAYING';
    score = pAng = wRot = spawnT = invertFlashTimer = shakeIntensity = 0; targetWRot = 0; walls = []; spd = 1;
    globalHue = Math.floor(Math.random() * 360);
    bestB.innerText = `BEST: ${getHi(DIFF_KEYS[diffIdx]).toFixed(2)}`;
    loadAndPlayMusic(DIFF_KEYS[diffIdx]);
    playTone(587, 'square', 0.3, 0.1); playTone(880, 'square', 0.4, 0.08, 0.1);
}

function go() {
    state = 'GAMEOVER'; hud.style.display = 'none'; menuOverlay.style.display = 'flex'; footerDock.style.display = 'flex';
    gameOverTime = Date.now();
    shakeIntensity = 25;
    stopMusic(); 
    playMenuMusic(); 
    playTone(150, 'sawtooth', 0.5, 0.3); playTone(80, 'triangle', 0.6, 0.4, 0.05);
    const d = DIFF_KEYS[diffIdx];
    let hi = getHi(d); 
    if (score > hi) { hi = score; localStorage.setItem('so_h_' + d, hi); }
    titleText.innerHTML = `GAME OVER<br><span style="font-size: 28px; color: #00ffcc; letter-spacing: 3px; display: block; margin-top: 10px; font-weight: 800;">SCORE: ${score.toFixed(2)}s</span>`;
    updateMenuUI();
}

function spawn() {
    let dist = Math.max(cvs.width, cvs.height) * 0.85;
    let thk = 36;
    let patternType = Math.floor(Math.random() * 5);
    const c = CFG[DIFF_KEYS[diffIdx]];

    if (patternType === 0) {
        let empty = Math.floor(Math.random() * SIDES);
        for (let i = 0; i < SIDES; i++) if (i !== empty) walls.push({ side: i, dist, thk });
    } else if (patternType === 1) {
        let start = Math.floor(Math.random() * 2);
        for (let i = start; i < SIDES; i += 2) walls.push({ side: i, dist, thk });
        for (let i = (start === 0 ? 1 : 0); i < SIDES; i += 2) walls.push({ side: i, dist: dist + 140, thk });
    } else if (patternType === 2) {
        let freeSide = Math.floor(Math.random() * SIDES);
        let spiralDir = Math.random() < 0.5 ? 1 : -1;
        for (let step = 0; step < 6; step++) {
            let side = (freeSide + (step * spiralDir)) % SIDES;
            if (side < 0) side += SIDES;
            walls.push({ side: side, dist: dist + (step * 45), thk: 32 });
        }
    } else if (patternType === 3) {
        let sideA = Math.floor(Math.random() * SIDES);
        let sideB = (sideA + 4) % SIDES;
        for (let step = 0; step < 3; step++) {
            walls.push({ side: (sideA + step) % SIDES, dist, thk });
            walls.push({ side: (sideB + step) % SIDES, dist, thk });
        }
    } else {
        let gate1 = Math.floor(Math.random() * SIDES);
        let gate2 = (gate1 + 3 + Math.floor(Math.random() * 2)) % SIDES;
        for (let i = 0; i < SIDES; i++) {
            if (i !== gate1 && i !== gate2) walls.push({ side: i, dist, thk });
        }
    }
    if (Math.random() < 0.4) { invertState = !invertState; invertFlashTimer = 10; }
}

function poly(cx, cy, r, s, off, fill, stroke, sw) {
    ctx.beginPath(); 
    for (let i = 0; i < s; i++) ctx.lineTo(cx + r * Math.cos(off + i * 2 * Math.PI / s), cy + r * Math.sin(off + i * 2 * Math.PI / s));
    ctx.closePath(); 
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } 
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw || 1; ctx.stroke(); }
}
function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 16.666;
    lastTime = timestamp;
    if (dt > 4) dt = 4;

    let currentShakeX = 0;
    let currentShakeY = 0;
    if (shakeIntensity > 0) {
        currentShakeX = (Math.random() - 0.5) * shakeIntensity;
        currentShakeY = (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity -= 1.2 * dt;
    }

    let cx = (cvs.width / 2) + currentShakeX;
    let cy = (cvs.height / 2) + currentShakeY; 
    
    ctx.fillStyle = '#020202'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    
    pulseT += 0.05 * dt; 
    let basePulse = Math.sin(pulseT);
    let p = basePulse * 4, rMax = Math.max(cvs.width, cvs.height) * 1.6;
    
    const curDiffKey = DIFF_KEYS[diffIdx];
    const c = CFG[curDiffKey];

    // Bulletproof Step-Based Loading System
    if (state === 'BOOT') {
        bootTimer += 16.666 * dt;
        wRot += 0.003 * dt;
        
        // Step 1: Hold on creator splash for 2 seconds
        if (bootTimer >= 2000 && !creatorSplash.classList.contains('hidden')) {
            creatorSplash.classList.add('hidden');
            gameLoading.classList.remove('hidden');
        }
        
        // Step 2: Once logo is shown, advance loading progress smoothly
        if (bootTimer >= 2100 && loadingProgress < 100) {
            loadingProgress += 1.5 * dt;
            if (loadingProgress >= 100) {
                loadingProgress = 100;
                gameLoading.classList.add('hidden');
                uiLayer.classList.remove('hidden');
                state = 'MENU';
                playMenuMusic(); 
                updateMenuUI();
            }
            progressBar.style.width = loadingProgress + '%';
        }
    }

    if (state === 'MENU' || state === 'GAMEOVER') {
        targetWRot += 0.003 * dt;
        wRot += (targetWRot - wRot) * 0.1 * dt;
        targetCenterRadius = 44 + Math.sin(pulseT * 0.5) * 2;
        globalHue = (globalHue + 0.08 * dt) % 360;
        diffLabel.style.color = "hsl(" + globalHue + ", 100%, 70%)";
    } else if (state === 'PLAYING') {
        score += (1/60) * dt; 
        scoreB.innerText = `TIME: ${score.toFixed(2)}`; 
        spd = 1 + Math.log10(1 + score * 0.15); 
        
        if (currentMusicTrack) currentMusicTrack.playbackRate = spd; 
        
        if (keys['arrowleft'] || keys['a']) pAng -= 0.095 * dt; 
        if (keys['arrowright'] || keys['d']) pAng += 0.095 * dt;
        
        wRot += c[1] * rDir * spd * dt; 
        if (score - lastRot > 4 && Math.random() < 0.02) { rDir *= -1; lastRot = score; }
        spawnT -= 1 * spd * dt; if (spawnT <= 0) { spawn(); spawnT = Math.max(45, c[2] - (score * 1.2)); } 
        
        globalHue = (globalHue + 0.15 * dt) % 360;
        targetCenterRadius = 44 + (basePulse * 5 * spd);
    }

    currentCenterRadius += (targetCenterRadius - currentCenterRadius) * 0.2 * dt;

    let flashOffset = (invertFlashTimer > 0) ? 25 : 0;
    if (invertFlashTimer > 0) invertFlashTimer -= dt;

    let lightnessBase = invertState ? 12 : 6;
    let lightnessAlt = invertState ? 6 : 12;

    let colorMain = `hsl(${globalHue}, 75%, ${lightnessBase + flashOffset}%)`;
    let colorAlt = `hsl(${(globalHue + 30) % 360}, 75%, ${lightnessAlt + flashOffset}%)`;

    for (let i = 0; i < SIDES; i++) {
        ctx.fillStyle = (i % 2 === 0) ? colorMain : colorAlt;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + rMax * Math.cos(wRot + i * 2 * Math.PI / SIDES), cy + rMax * Math.sin(wRot + i * 2 * Math.PI / SIDES));
        ctx.lineTo(cx + rMax * Math.cos(wRot + ((i + 1) * 2 * Math.PI / SIDES)), cy + rMax * Math.sin(wRot + ((i + 1) * 2 * Math.PI / SIDES)));
        ctx.closePath(); ctx.fill();
    }

    let shOffX = Math.cos(wRot) * 12, shOffY = Math.sin(wRot) * 12;
    
    for (let i = walls.length - 1; i >= 0; i--) {
        let w = walls[i]; if (state === 'PLAYING') w.dist -= c[0] * spd * dt; 
        if (w.dist + w.thk < currentCenterRadius) { walls.splice(i, 1); continue; }
        
        let a1 = wRot + w.side * 2 * Math.PI / SIDES;
        let a2 = wRot + (w.side + 1) * 2 * Math.PI / SIDES;
        
        let wallX1 = cx + w.dist * Math.cos(a1); let wallY1 = cy + w.dist * Math.sin(a1);
        let wallX2 = cx + w.dist * Math.cos(a2); let wallY2 = cy + w.dist * Math.sin(a2);
        let wallX3 = cx + (w.dist + w.thk) * Math.cos(a2); let wallY3 = cy + (w.dist + w.thk) * Math.sin(a2);
        let wallX4 = cx + (w.dist + w.thk) * Math.cos(a1); let wallY4 = cy + (w.dist + w.thk) * Math.sin(a1);

        ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + rMax * Math.cos(a1), cy + rMax * Math.sin(a1)); ctx.lineTo(cx + rMax * Math.cos(a2), cy + rMax * Math.sin(a2));
        ctx.closePath(); ctx.clip();

        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath();
        ctx.moveTo(wallX1 + shOffX, wallY1 + shOffY); ctx.lineTo(wallX2 + shOffX, wallY2 + shOffY);
        ctx.lineTo(wallX3 + shOffX, wallY3 + shOffY); ctx.lineTo(wallX4 + shOffX, wallY4 + shOffY);
        ctx.closePath(); ctx.fill(); ctx.restore();
        
        let wallColor = `hsl(${globalHue}, 100%, 50%)`;
        ctx.fillStyle = wallColor; 
        ctx.beginPath();
        ctx.moveTo(wallX1, wallY1); ctx.lineTo(wallX2, wallY2); ctx.lineTo(wallX3, wallY3); ctx.lineTo(wallX4, wallY4);
        ctx.closePath(); ctx.fill();
        
        ctx.strokeStyle = wallColor; ctx.lineWidth = 1.5; ctx.stroke();
        
        if (state === 'PLAYING' && P_DIST >= w.dist && (P_DIST - P_SIZE) <= (w.dist + w.thk)) {
            let nP = pAng % (2 * Math.PI); if (nP < 0) nP += 2 * Math.PI;
            if (Math.floor(nP / (2 * Math.PI / SIDES)) % SIDES === w.side) go();
        }
    }
    
    poly(cx + shOffX * 0.5, cy + shOffY * 0.5, currentCenterRadius, SIDES, wRot, 'rgba(0,0,0,0.6)');
    poly(cx, cy, currentCenterRadius, SIDES, wRot, '#0b0b0b', '#ffffff', 4);
    
    if (state === 'PLAYING' || state === 'GAMEOVER' || state === 'PAUSED') {
        ctx.save(); ctx.translate(cx + shOffX * 0.4, cy + shOffY * 0.4); ctx.rotate(wRot + pAng); ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.moveTo(P_DIST, 0); ctx.lineTo(P_DIST - P_SIZE, -P_SIZE); ctx.lineTo(P_DIST - P_SIZE, P_SIZE); ctx.closePath(); ctx.fill(); ctx.restore();
        
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(wRot + pAng); ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(P_DIST, 0); ctx.lineTo(P_DIST - P_SIZE, -P_SIZE); ctx.lineTo(P_DIST - P_SIZE, P_SIZE); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    requestAnimationFrame(loop);
}
updateMenuUI();
requestAnimationFrame(loop);
