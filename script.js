// SQL Concentration Game - Complete Implementation
class SQLConcentrationGame {
    constructor() {
        this.cards = [];
        this.gameCards = [];
        this.flippedCards = [];
        this.matchedPairs = [];
        this.displayCards = [];
        this.currentRound = 1;
        this.attempts = 0;
        this.score = 1000;
        this.settings = {
            matchedPairBehavior: 'stay',
            autoAdvance: false,
            timerDuration: 60,
            openaiApiKey: '',
            listenSpeakExplanation: true,
            listenSpeakExample: true
        };
        this.preGameTimer = null;
        this.isGameActive = false;
        this.currentAudio = null;
        this.isPlayingAll = false;
        this.audioCache = {};
        this.isCommandHidden = false;
        this.isExplanationHidden = false;
        this.library = null;
        this.currentDeck = null;

        // Practice mode state
        this.practiceIndex = 0;
        this.practiceCorrect = 0;
        this.practiceIncorrect = 0;
        this.practiceCards = [];

        // Drag drop state
        this.dragDropMatches = 0;
        this.dragDropAttempts = 0;
        this.dragItems = [];

        // Timed mode state
        this.timedActive = false;
        this.timedIndex = 0;
        this.timedScore = 0;
        this.timedTimer = null;
        this.timedTimeLeft = 5;
        this.timedCards = [];

        this.init();
    }

    async init() {
        this.loadSettings();
        await this.loadOpenAIKey();
        await this.loadLibrary();
        this.setupEventListeners();
        this.showModeSelection();
    }

    async loadOpenAIKey() {
        try {
            const response = await fetch('/api/openai-key');
            const data = await response.json();
            if (data.key) {
                this.settings.openaiApiKey = data.key;
            }
        } catch (e) {
            console.log('Could not load OpenAI key');
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('sqlGameSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.updateSettingsUI();
    }

    saveSettings() {
        localStorage.setItem('sqlGameSettings', JSON.stringify(this.settings));
    }

    updateSettingsUI() {
        const updateEl = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = value;
            else el.value = value;
        };

        updateEl('matchedPairBehavior', this.settings.matchedPairBehavior);
        updateEl('autoAdvance', this.settings.autoAdvance);
        updateEl('timerDuration', this.settings.timerDuration);
        updateEl('openaiApiKey', this.settings.openaiApiKey);
        updateEl('listenSpeakExplanation', this.settings.listenSpeakExplanation);
        updateEl('listenSpeakExample', this.settings.listenSpeakExample);

        // Update toggle button states
        const expBtn = document.getElementById('toggleListenExplanation');
        const exBtn = document.getElementById('toggleListenExample');
        if (expBtn) expBtn.classList.toggle('active', this.settings.listenSpeakExplanation);
        if (exBtn) exBtn.classList.toggle('active', this.settings.listenSpeakExample);
    }

    async loadLibrary() {
        try {
            const response = await fetch('decks/index.json');
            this.library = await response.json();

            if (this.library.decks && this.library.decks.length > 0) {
                await this.loadDeck(this.library.decks[0].filename);
            }
        } catch (e) {
            console.error('Failed to load library:', e);
            this.useDefaultCards();
        }
    }

    async loadDeck(filename) {
        try {
            const response = await fetch(`decks/${filename}`);
            const data = await response.json();
            this.cards = data.cards || [];
            this.currentDeck = filename;
            this.displayPreGameCards();
            this.displayListenList();
        } catch (e) {
            console.error('Failed to load deck:', e);
        }
    }

    useDefaultCards() {
        this.cards = [
            { id: "1", command: "SELECT", syntax: "SELECT col FROM table;", description: "Retrieves data from database", example: "SELECT name FROM users;", category: "Query", explanation: "SELECT retrieves data from one or more tables." }
        ];
    }

    // Screen Management
    showModeSelection() {
        this.hideAllScreens();
        document.getElementById('gameModeScreen')?.classList.add('active');
    }

    showPreGame() {
        this.hideAllScreens();
        document.getElementById('preGameScreen')?.classList.add('active');
        this.displayPreGameCards();
        if (this.settings.autoAdvance) {
            this.startPreGameTimer();
        }
    }

    showGame() {
        this.hideAllScreens();
        document.getElementById('gameScreen')?.classList.add('active');
    }

    showDragDrop() {
        this.hideAllScreens();
        document.getElementById('dragDropScreen')?.classList.add('active');
        this.setupDragDrop();
    }

    showListenMode() {
        this.hideAllScreens();
        document.getElementById('listenScreen')?.classList.add('active');
        this.displayListenList();
    }

    showPracticeMode() {
        this.hideAllScreens();
        document.getElementById('practiceScreen')?.classList.add('active');
        this.setupPractice();
    }

    showTimedMode() {
        this.hideAllScreens();
        document.getElementById('timedScreen')?.classList.add('active');
        this.setupTimedMode();
    }

    hideAllScreens() {
        ['gameModeScreen', 'preGameScreen', 'gameScreen', 'dragDropScreen', 'listenScreen', 'practiceScreen', 'timedScreen'].forEach(id => {
            document.getElementById(id)?.classList.remove('active');
        });
    }

    // Pre-Game Timer
    startPreGameTimer() {
        this.stopPreGameTimer();
        let timeLeft = this.settings.timerDuration;
        const display = document.getElementById('preGameTimer');

        const update = () => {
            if (display) {
                const mins = Math.floor(timeLeft / 60);
                const secs = timeLeft % 60;
                display.textContent = `Auto-start in: ${mins}:${secs.toString().padStart(2, '0')}`;
            }
        };

        update();
        this.preGameTimer = setInterval(() => {
            timeLeft--;
            update();
            if (timeLeft <= 0) {
                this.stopPreGameTimer();
                this.startGame();
            }
        }, 1000);
    }

    stopPreGameTimer() {
        if (this.preGameTimer) {
            clearInterval(this.preGameTimer);
            this.preGameTimer = null;
        }
        const display = document.getElementById('preGameTimer');
        if (display) display.textContent = '';
    }

    // Pre-Game Card Display
    displayPreGameCards() {
        const container = document.getElementById('cardPairsDisplay');
        if (!container) return;
        container.innerHTML = '';

        this.displayCards = [...this.cards];

        this.displayCards.forEach((card, index) => {
            const pair = document.createElement('div');
            pair.className = 'card-pair';
            pair.dataset.index = index;

            pair.innerHTML = `
                <div class="playing-card sql-card ${this.isCommandHidden ? 'flipped' : ''}">
                    <div class="card-face card-front">
                        <div class="card-category">${card.category || 'SQL'}</div>
                        <div class="card-command">${card.command}</div>
                        <div class="card-syntax">${card.syntax || ''}</div>
                    </div>
                    <div class="card-face card-back"><div>?</div></div>
                </div>
                <div class="playing-card explanation-card ${this.isExplanationHidden ? 'flipped' : ''}">
                    <div class="card-face card-front">
                        <div class="card-description">${card.description}</div>
                        <div class="card-example">${card.example || ''}</div>
                    </div>
                    <div class="card-face card-back"><div>?</div></div>
                </div>
            `;
            container.appendChild(pair);
        });
    }

    flipCommands() {
        this.isCommandHidden = !this.isCommandHidden;
        document.querySelectorAll('.sql-card').forEach(c => c.classList.toggle('flipped', this.isCommandHidden));
        const btn = document.getElementById('flipCommandBtn');
        if (btn) btn.textContent = this.isCommandHidden ? '👀 Show Commands' : '🙈 Hide Commands';
    }

    flipExplanations() {
        this.isExplanationHidden = !this.isExplanationHidden;
        document.querySelectorAll('.explanation-card').forEach(c => c.classList.toggle('flipped', this.isExplanationHidden));
        const btn = document.getElementById('flipExplanationBtn');
        if (btn) btn.textContent = this.isExplanationHidden ? '👀 Show Explanations' : '🙈 Hide Explanations';
    }

    resetFlips() {
        this.isCommandHidden = false;
        this.isExplanationHidden = false;
        document.querySelectorAll('.sql-card').forEach(c => c.classList.remove('flipped'));
        document.querySelectorAll('.explanation-card').forEach(c => c.classList.remove('flipped'));
        const cmdBtn = document.getElementById('flipCommandBtn');
        const expBtn = document.getElementById('flipExplanationBtn');
        if (cmdBtn) cmdBtn.textContent = '🙈 Hide Commands';
        if (expBtn) expBtn.textContent = '🙈 Hide Explanations';
    }

    scrambleCards() {
        for (let i = this.displayCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.displayCards[i], this.displayCards[j]] = [this.displayCards[j], this.displayCards[i]];
        }
        this.displayPreGameCards();
    }

    // Game Logic
    startGame() {
        this.stopPreGameTimer();
        this.isGameActive = true;
        this.attempts = 0;
        this.score = 1000;
        this.matchedPairs = [];
        this.flippedCards = [];

        this.createGameCards();
        this.showGame();
        this.updateGameUI();
    }

    createGameCards() {
        this.gameCards = [];
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;

        cardsToUse.forEach(card => {
            this.gameCards.push({ ...card, type: 'command', pairId: card.id, matched: false });
            this.gameCards.push({ ...card, type: 'explanation', pairId: card.id, matched: false });
        });

        this.shuffleArray(this.gameCards);
        this.displayGameBoard();
    }

    displayGameBoard() {
        const board = document.getElementById('gameBoard');
        if (!board) return;
        board.innerHTML = '';

        this.gameCards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'game-card';
            cardEl.dataset.index = index;

            if (card.type === 'command') {
                cardEl.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="card-category-tag">${card.category || 'SQL'}</div>
                            <div class="card-command-text">${card.command}</div>
                        </div>
                        <div class="card-back"><span>SQL</span></div>
                    </div>
                `;
            } else {
                cardEl.innerHTML = `
                    <div class="card-inner">
                        <div class="card-front">
                            <div class="card-desc-text">${card.description}</div>
                        </div>
                        <div class="card-back"><span>📝</span></div>
                    </div>
                `;
            }

            cardEl.addEventListener('click', () => this.flipCard(index));
            board.appendChild(cardEl);
        });
    }

    flipCard(index) {
        if (!this.isGameActive) return;
        if (this.flippedCards.length >= 2) return;
        if (this.flippedCards.includes(index)) return;
        if (this.gameCards[index].matched) return;

        const cardEl = document.querySelector(`.game-card[data-index="${index}"]`);
        if (cardEl) cardEl.classList.add('flipped');
        this.flippedCards.push(index);

        if (this.flippedCards.length === 2) {
            this.attempts++;
            this.checkMatch();
        }
    }

    checkMatch() {
        const [idx1, idx2] = this.flippedCards;
        const card1 = this.gameCards[idx1];
        const card2 = this.gameCards[idx2];

        if (card1.pairId === card2.pairId && card1.type !== card2.type) {
            this.score += 50;
            this.matchedPairs.push(card1.pairId);
            card1.matched = true;
            card2.matched = true;

            setTimeout(() => {
                document.querySelector(`.game-card[data-index="${idx1}"]`)?.classList.add('matched');
                document.querySelector(`.game-card[data-index="${idx2}"]`)?.classList.add('matched');
                this.flippedCards = [];
                this.updateGameUI();

                const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
                if (this.matchedPairs.length === cardsToUse.length) {
                    this.roundComplete();
                }
            }, 500);
        } else {
            this.score = Math.max(0, this.score - 10);
            setTimeout(() => {
                document.querySelector(`.game-card[data-index="${idx1}"]`)?.classList.remove('flipped');
                document.querySelector(`.game-card[data-index="${idx2}"]`)?.classList.remove('flipped');
                this.flippedCards = [];
                this.updateGameUI();
            }, 1000);
        }
    }

    updateGameUI() {
        const attemptsEl = document.getElementById('attempts');
        const scoreEl = document.getElementById('score');
        const matchesEl = document.getElementById('matches');
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;

        if (attemptsEl) attemptsEl.textContent = this.attempts;
        if (scoreEl) scoreEl.textContent = this.score;
        if (matchesEl) matchesEl.textContent = `${this.matchedPairs.length}/${cardsToUse.length}`;
    }

    roundComplete() {
        document.getElementById('celebrationMessage').textContent =
            `Round ${this.currentRound} complete!\nScore: ${this.score}\nAttempts: ${this.attempts}`;
        document.getElementById('celebrationModal').style.display = 'flex';
    }

    restartRound() {
        this.startGame();
    }

    nextRound() {
        this.currentRound++;
        this.startGame();
    }

    // Drag & Drop Mode
    setupDragDrop() {
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
        this.dragItems = [...cardsToUse].sort(() => Math.random() - 0.5);
        this.dragDropMatches = 0;
        this.dragDropAttempts = 0;

        this.updateDragDropUI();
        this.displayDragDrop();
    }

    displayDragDrop() {
        const dragContainer = document.getElementById('dragItems');
        const dropContainer = document.getElementById('dropZones');

        if (!dragContainer || !dropContainer) return;

        // Shuffle for drop zones
        const dropItems = [...this.dragItems].sort(() => Math.random() - 0.5);

        dragContainer.innerHTML = '';
        dropContainer.innerHTML = '';

        this.dragItems.forEach((card, i) => {
            const item = document.createElement('div');
            item.className = 'drag-item';
            item.draggable = true;
            item.dataset.id = card.id;
            item.textContent = card.command;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', card.id);
            });
            dragContainer.appendChild(item);
        });

        dropItems.forEach((card, i) => {
            const zone = document.createElement('div');
            zone.className = 'drop-zone';
            zone.dataset.id = card.id;
            zone.innerHTML = `<div class="drop-zone-desc">${card.description}</div>`;

            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                this.handleDrop(draggedId, zone.dataset.id, zone);
            });

            dropContainer.appendChild(zone);
        });
    }

    handleDrop(draggedId, zoneId, zoneEl) {
        this.dragDropAttempts++;

        if (draggedId === zoneId) {
            this.dragDropMatches++;
            zoneEl.classList.add('matched');

            // Remove the matched drag item
            const dragItem = document.querySelector(`.drag-item[data-id="${draggedId}"]`);
            if (dragItem) dragItem.style.display = 'none';
        }

        this.updateDragDropUI();
    }

    updateDragDropUI() {
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
        const matchesEl = document.getElementById('dragDropMatches');
        const attemptsEl = document.getElementById('dragDropAttempts');

        if (matchesEl) matchesEl.textContent = this.dragDropMatches;
        if (attemptsEl) attemptsEl.textContent = this.dragDropAttempts;

        if (this.dragDropMatches === cardsToUse.length) {
            setTimeout(() => {
                alert(`Drag & Drop Complete!\nMatches: ${this.dragDropMatches}/${cardsToUse.length}\nAttempts: ${this.dragDropAttempts}`);
            }, 500);
        }
    }

    checkDragDrop() {
        // Validate all drop zones
        const dropZones = document.querySelectorAll('.drop-zone');
        let correctMatches = 0;

        dropZones.forEach(zone => {
            const zoneId = zone.dataset.id;
            const droppedItem = zone.querySelector('.drag-item');

            if (droppedItem && droppedItem.dataset.id === zoneId) {
                correctMatches++;
            }
        });

        this.dragDropMatches = correctMatches;
        this.dragDropAttempts++;

        this.updateDragDropUI();

        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
        if (this.dragDropMatches === cardsToUse.length) {
            setTimeout(() => {
                alert(`Drag & Drop Complete!\nMatches: ${this.dragDropMatches}/${cardsToUse.length}\nAttempts: ${this.dragDropAttempts}`);
            }, 500);
        }
    }

    resetDragDrop() {
        this.setupDragDrop();
    }

    // Listen Mode
    displayListenList() {
        const list = document.getElementById('listenList');
        if (!list) return;
        list.innerHTML = '';

        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;

        cardsToUse.forEach((card, index) => {
            const item = document.createElement('div');
            item.className = 'listen-item';
            item.dataset.index = index;

            item.innerHTML = `
                <div class="listen-item-header">
                    <span class="listen-number">${index + 1}</span>
                    <div class="listen-command">${card.command}</div>
                    <div class="listen-category">${card.category || 'SQL'}</div>
                    <div class="listen-buttons">
                        <button class="listen-play-btn" data-index="${index}" title="Play audio">▶️</button>
                        <button class="listen-ai-btn" data-index="${index}" title="Ask AI">🤖</button>
                    </div>
                </div>
                <div class="listen-item-content">
                    <div class="listen-syntax"><code>${card.syntax || ''}</code></div>
                    <div class="listen-description">${card.description}</div>
                    <div class="listen-example"><strong>Example:</strong> <code>${card.example || ''}</code></div>
                    <div class="listen-explanation">${card.explanation || ''}</div>
                </div>
            `;
            list.appendChild(item);
        });

        // Add event listeners
        list.querySelectorAll('.listen-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.playListenItem(cardsToUse[idx], idx);
            });
        });

        list.querySelectorAll('.listen-ai-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.askAIAboutCommand(cardsToUse[idx]);
            });
        });
    }

    async playListenItem(card, index) {
        if (!this.settings.openaiApiKey) {
            alert('Please set your OpenAI API key in Settings.');
            return;
        }

        this.stopPlayback();

        const btn = document.querySelector(`.listen-play-btn[data-index="${index}"]`);
        if (btn) btn.textContent = '⏳';

        try {
            let text = '';
            if (this.settings.listenSpeakExplanation) {
                text += `${card.command}. ${card.description}. `;
            }
            if (this.settings.listenSpeakExample && card.example) {
                text += `For example: ${card.example}`;
            }

            const blob = await this.getTTS(text);
            if (blob) {
                this.currentAudio = new Audio(URL.createObjectURL(blob));
                this.currentAudio.onended = () => {
                    if (btn) btn.textContent = '▶️';
                };
                this.currentAudio.play();
            }
        } catch (e) {
            console.error('TTS error:', e);
            if (btn) btn.textContent = '▶️';
            alert('Failed to play audio.');
        }
    }

    async playAllListen() {
        if (this.isPlayingAll) return;
        if (!this.settings.openaiApiKey) {
            alert('Please set your OpenAI API key in Settings.');
            return;
        }

        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;

        this.isPlayingAll = true;
        const playBtn = document.getElementById('playAllBtn');
        if (playBtn) {
            playBtn.textContent = '⏳ Playing...';
            playBtn.disabled = true;
        }

        for (let i = 0; i < cardsToUse.length && this.isPlayingAll; i++) {
            const card = cardsToUse[i];
            const item = document.querySelector(`.listen-item[data-index="${i}"]`);
            const btn = item?.querySelector('.listen-play-btn');

            // Highlight current
            document.querySelectorAll('.listen-item').forEach(el => el.classList.remove('playing'));
            item?.classList.add('playing');
            if (btn) btn.textContent = '🔊';

            try {
                let text = '';
                if (this.settings.listenSpeakExplanation) {
                    text += `${card.command}. ${card.description}. `;
                }
                if (this.settings.listenSpeakExample && card.example) {
                    text += `For example: ${card.example}`;
                }

                const blob = await this.getTTS(text);
                if (blob && this.isPlayingAll) {
                    await new Promise((resolve) => {
                        this.currentAudio = new Audio(URL.createObjectURL(blob));
                        this.currentAudio.onended = resolve;
                        this.currentAudio.onerror = resolve;
                        this.currentAudio.play();
                    });
                }
            } catch (e) {
                console.error('TTS error:', e);
            }

            if (btn) btn.textContent = '▶️';
        }

        this.isPlayingAll = false;
        document.querySelectorAll('.listen-item').forEach(el => el.classList.remove('playing'));
        if (playBtn) {
            playBtn.textContent = '▶️ Play All';
            playBtn.disabled = false;
        }
    }

    stopPlayback() {
        this.isPlayingAll = false;
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
    }

    clearAudioCache() {
        this.audioCache = {};
        alert('Audio cache cleared!');
    }

    async getTTS(text) {
        if (this.audioCache[text]) return this.audioCache[text];

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice: 'nova'
            })
        });

        if (!response.ok) throw new Error(`TTS API error: ${response.status}`);

        const blob = await response.blob();
        this.audioCache[text] = blob;
        return blob;
    }

    async askAIAboutCommand(card) {
        if (!this.settings.openaiApiKey) {
            alert('Please set your OpenAI API key in Settings.');
            return;
        }

        const modal = document.getElementById('aiExplanationModal');
        const content = document.getElementById('aiExplanationContent');
        const title = document.getElementById('aiExplanationTitle');

        if (!modal || !content || !title) return;

        title.textContent = `🤖 ${card.command}`;
        content.innerHTML = '<div class="ai-loading">Analyzing SQL command...</div>';
        modal.style.display = 'flex';

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: `Explain this SQL command in detail for a learner:

Command: ${card.command}
Syntax: ${card.syntax || 'N/A'}
Example: ${card.example || 'N/A'}

Please provide:
1. **What it does** - Clear explanation of the command's purpose
2. **Syntax breakdown** - Explain each part of the syntax
3. **When to use it** - Common scenarios
4. **Best practices** - Tips for using it effectively
5. **Related commands** - Similar or complementary SQL commands
6. **Common mistakes** - What to avoid

Format with clear headings and code examples.`
                    }]
                })
            });

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;
            content.innerHTML = `<div class="ai-content">${this.formatMarkdown(aiResponse)}</div>`;
        } catch (e) {
            content.innerHTML = `<div class="ai-error">Error: ${e.message}</div>`;
        }
    }

    formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
    }

    closeAIModal() {
        document.getElementById('aiExplanationModal').style.display = 'none';
    }

    // Practice Mode
    setupPractice() {
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
        this.practiceCards = [...cardsToUse].sort(() => Math.random() - 0.5);
        this.practiceIndex = 0;
        this.practiceCorrect = 0;
        this.practiceIncorrect = 0;

        this.updatePracticeUI();
        this.showPracticeCard();
    }

    showPracticeCard() {
        if (this.practiceIndex >= this.practiceCards.length) {
            alert(`Practice Complete!\nCorrect: ${this.practiceCorrect}\nIncorrect: ${this.practiceIncorrect}`);
            this.showModeSelection();
            return;
        }

        const card = this.practiceCards[this.practiceIndex];
        const catEl = document.getElementById('practiceCategory');
        const descEl = document.getElementById('practiceDescription');
        const inputEl = document.getElementById('practiceInput');
        const feedbackEl = document.getElementById('practiceFeedback');

        if (catEl) catEl.textContent = card.category || 'SQL';
        if (descEl) descEl.textContent = card.description;
        if (inputEl) {
            inputEl.value = '';
            inputEl.focus();
        }
        if (feedbackEl) feedbackEl.innerHTML = '';
    }

    checkPracticeAnswer() {
        const inputEl = document.getElementById('practiceInput');
        const feedbackEl = document.getElementById('practiceFeedback');

        if (!inputEl) return;

        const userAnswer = inputEl.value.trim().toUpperCase();
        const correctAnswer = this.practiceCards[this.practiceIndex].command.toUpperCase();

        // Normalize answers for comparison
        const normalize = (s) => s.replace(/\s+/g, ' ').trim();

        if (normalize(userAnswer) === normalize(correctAnswer)) {
            this.practiceCorrect++;
            if (feedbackEl) {
                feedbackEl.innerHTML = '<div class="feedback-correct">✅ Correct!</div>';
            }
            setTimeout(() => {
                this.practiceIndex++;
                this.updatePracticeUI();
                this.showPracticeCard();
            }, 1000);
        } else {
            this.practiceIncorrect++;
            if (feedbackEl) {
                feedbackEl.innerHTML = `<div class="feedback-incorrect">❌ Incorrect. The answer is: <code>${this.practiceCards[this.practiceIndex].command}</code></div>`;
            }
            setTimeout(() => {
                this.practiceIndex++;
                this.updatePracticeUI();
                this.showPracticeCard();
            }, 2000);
        }
    }

    skipPractice() {
        this.practiceIncorrect++;
        this.practiceIndex++;
        this.updatePracticeUI();
        this.showPracticeCard();
    }

    showHint() {
        const card = this.practiceCards[this.practiceIndex];
        const feedbackEl = document.getElementById('practiceFeedback');
        const hint = card.command.substring(0, Math.ceil(card.command.length / 3)) + '...';
        if (feedbackEl) {
            feedbackEl.innerHTML = `<div class="feedback-hint">💡 Hint: ${hint}</div>`;
        }
    }

    updatePracticeUI() {
        const correctEl = document.getElementById('practiceCorrect');
        const incorrectEl = document.getElementById('practiceIncorrect');

        if (correctEl) correctEl.textContent = this.practiceCorrect;
        if (incorrectEl) incorrectEl.textContent = this.practiceIncorrect;
    }

    // Timed Mode
    setupTimedMode() {
        const cardsToUse = this.displayCards.length > 0 ? this.displayCards : this.cards;
        this.timedCards = [...cardsToUse].sort(() => Math.random() - 0.5);
        this.timedIndex = 0;
        this.timedScore = 0;
        this.timedActive = true;

        this.updateTimedUI();
        this.showTimedCard();
    }

    showTimedCard() {
        if (this.timedIndex >= this.timedCards.length) {
            this.endTimedMode();
            return;
        }

        const card = this.timedCards[this.timedIndex];
        const container = document.getElementById('timedCardPair');

        if (container) {
            container.innerHTML = `
                <div class="timed-card">
                    <div class="card-category">${card.category || 'SQL'}</div>
                    <div class="card-command">${card.command}</div>
                </div>
                <div class="timed-card">
                    <div class="card-description">${card.description}</div>
                </div>
            `;
        }

        this.timedTimeLeft = 5;
        this.startTimedTimer();
        this.updateTimedUI();
    }

    startTimedTimer() {
        this.stopTimedTimer();

        const timerDisplay = document.getElementById('timedTimerDisplay');

        this.timedTimer = setInterval(() => {
            this.timedTimeLeft--;
            if (timerDisplay) timerDisplay.textContent = this.timedTimeLeft;

            if (this.timedTimeLeft <= 0) {
                this.stopTimedTimer();
                this.timedThumbsDown();
            }
        }, 1000);
    }

    stopTimedTimer() {
        if (this.timedTimer) {
            clearInterval(this.timedTimer);
            this.timedTimer = null;
        }
    }

    timedThumbsUp() {
        this.stopTimedTimer();
        this.timedScore += Math.max(10, this.timedTimeLeft * 10);
        this.timedIndex++;
        this.updateTimedUI();
        this.showTimedCard();
    }

    timedThumbsDown() {
        this.stopTimedTimer();
        this.timedIndex++;
        this.updateTimedUI();
        this.showTimedCard();
    }

    endTimedMode() {
        this.timedActive = false;
        this.stopTimedTimer();
        alert(`Timed Challenge Complete!\nScore: ${this.timedScore}`);
        this.showModeSelection();
    }

    updateTimedUI() {
        const scoreEl = document.getElementById('timedScore');
        const currentEl = document.getElementById('timedCurrentCard');
        const totalEl = document.getElementById('timedTotalCards');
        const timerEl = document.getElementById('timedTimerDisplay');

        if (scoreEl) scoreEl.textContent = this.timedScore;
        if (currentEl) currentEl.textContent = this.timedIndex + 1;
        if (totalEl) totalEl.textContent = this.timedCards.length;
        if (timerEl) timerEl.textContent = this.timedTimeLeft;
    }

    // Library
    showLibrary() {
        if (!this.library) {
            alert('Library not loaded yet.');
            return;
        }
        
        const grid = document.getElementById('libraryGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.library.decks.forEach(deck => {
            const item = document.createElement('div');
            item.className = 'library-item';
            item.innerHTML = `
                <div class="library-item-name">${deck.name}</div>
                <div class="library-item-desc">${deck.description || ''}</div>
                <div class="library-item-count">${deck.cardCount} commands • ${deck.difficulty || 'all levels'}</div>
            `;
            item.addEventListener('click', () => {
                this.loadDeck(deck.filename);
                document.getElementById('libraryModal').style.display = 'none';
            });
            grid.appendChild(item);
        });
        
        document.getElementById('libraryModal').style.display = 'flex';
    }

    // Import
    handleImport(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.cards && Array.isArray(data.cards)) {
                    this.cards = data.cards;
                    this.displayPreGameCards();
                    this.displayListenList();
                    alert(`Imported ${data.cards.length} SQL commands!`);
                } else {
                    alert('Invalid file format. Expected { "cards": [...] }');
                }
            } catch (e) {
                alert('Error parsing JSON file: ' + e.message);
            }
        };
        reader.readAsText(file);
    }

    // Utilities
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Mode selection cards
        document.getElementById('memorizeMode')?.addEventListener('click', () => this.showPreGame());
        document.getElementById('concentrationMode')?.addEventListener('click', () => {
            this.displayPreGameCards();
            this.displayListenList();
            this.showGame();
        });
        document.getElementById('dragDropMode')?.addEventListener('click', () => this.showDragDrop());
        document.getElementById('listenMode')?.addEventListener('click', () => this.showListenMode());
        document.getElementById('practiceMode')?.addEventListener('click', () => this.showPracticeMode());
        document.getElementById('timedMode')?.addEventListener('click', () => this.showTimedMode());

        // Pre-game controls
        document.getElementById('startGameBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('chooseModeBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('flipCommandBtn')?.addEventListener('click', () => this.flipCommands());
        document.getElementById('flipExplanationBtn')?.addEventListener('click', () => this.flipExplanations());
        document.getElementById('resetFlipBtn')?.addEventListener('click', () => this.resetFlips());
        document.getElementById('scrambleBtn')?.addEventListener('click', () => this.scrambleCards());

        // Game controls
        document.getElementById('backToMemorizeBtn')?.addEventListener('click', () => this.showPreGame());
        document.getElementById('restartRoundBtn')?.addEventListener('click', () => this.restartRound());

        // Celebration modal
        document.getElementById('playAgainBtn')?.addEventListener('click', () => {
            document.getElementById('celebrationModal').style.display = 'none';
            this.restartRound();
        });
        document.getElementById('nextRoundBtn')?.addEventListener('click', () => {
            document.getElementById('celebrationModal').style.display = 'none';
            this.nextRound();
        });

        // Drag & Drop controls
        document.getElementById('checkDragDropBtn')?.addEventListener('click', () => this.checkDragDrop());
        document.getElementById('resetDragDropBtn')?.addEventListener('click', () => this.resetDragDrop());
        document.getElementById('exitDragDropBtn')?.addEventListener('click', () => this.showModeSelection());

        // Listen mode controls
        document.getElementById('toggleListenExplanation')?.addEventListener('click', (e) => {
            this.settings.listenSpeakExplanation = !this.settings.listenSpeakExplanation;
            e.target.classList.toggle('active', this.settings.listenSpeakExplanation);
        });
        document.getElementById('toggleListenExample')?.addEventListener('click', (e) => {
            this.settings.listenSpeakExample = !this.settings.listenSpeakExample;
            e.target.classList.toggle('active', this.settings.listenSpeakExample);
        });
        document.getElementById('toggleListenLoop')?.addEventListener('click', (e) => {
            e.target.classList.toggle('active');
        });
        document.getElementById('playAllBtn')?.addEventListener('click', () => this.playAllListen());
        document.getElementById('stopPlaybackBtn')?.addEventListener('click', () => this.stopPlayback());
        document.getElementById('clearCacheBtn')?.addEventListener('click', () => this.clearAudioCache());
        document.getElementById('exitListenBtn')?.addEventListener('click', () => this.showModeSelection());

        // Practice mode controls
        document.getElementById('checkPracticeBtn')?.addEventListener('click', () => this.checkPracticeAnswer());
        document.getElementById('skipPracticeBtn')?.addEventListener('click', () => this.skipPractice());
        document.getElementById('hintPracticeBtn')?.addEventListener('click', () => this.showHint());
        document.getElementById('exitPracticeBtn')?.addEventListener('click', () => this.showModeSelection());
        document.getElementById('practiceInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkPracticeAnswer();
        });

        // Timed mode controls
        document.getElementById('timedThumbsUp')?.addEventListener('click', () => this.timedThumbsUp());
        document.getElementById('timedThumbsDown')?.addEventListener('click', () => this.timedThumbsDown());
        document.getElementById('exitTimedBtn')?.addEventListener('click', () => {
            this.timedActive = false;
            this.stopTimedTimer();
            this.showModeSelection();
        });

        // Settings
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.updateSettingsUI();
            document.getElementById('settingsModal').style.display = 'flex';
        });
        document.getElementById('settingsClose')?.addEventListener('click', () => {
            document.getElementById('settingsModal').style.display = 'none';
        });
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            const getVal = (id) => {
                const el = document.getElementById(id);
                if (!el) return null;
                return el.type === 'checkbox' ? el.checked : el.value;
            };

            this.settings.matchedPairBehavior = getVal('matchedPairBehavior') || 'stay';
            this.settings.autoAdvance = getVal('autoAdvance') || false;
            this.settings.timerDuration = parseInt(getVal('timerDuration')) || 60;
            this.settings.openaiApiKey = getVal('openaiApiKey') || '';
            this.settings.listenSpeakExplanation = getVal('listenSpeakExplanation') !== false;
            this.settings.listenSpeakExample = getVal('listenSpeakExample') !== false;

            this.saveSettings();
            document.getElementById('settingsModal').style.display = 'none';
        });

        // Library
        document.getElementById('libraryBtn')?.addEventListener('click', () => this.showLibrary());
        document.getElementById('libraryClose')?.addEventListener('click', () => {
            document.getElementById('libraryModal').style.display = 'none';
        });

        // Import
        document.getElementById('importBtn')?.addEventListener('click', () => {
            document.getElementById('importModal').style.display = 'flex';
        });
        document.getElementById('importClose')?.addEventListener('click', () => {
            document.getElementById('importModal').style.display = 'none';
        });
        document.getElementById('fileInput')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImport(e.target.files[0]);
                document.getElementById('importModal').style.display = 'none';
            }
        });

        // AI Modal
        document.getElementById('closeAiExplanationModal')?.addEventListener('click', () => this.closeAIModal());
        document.getElementById('aiExplanationModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'aiExplanationModal') this.closeAIModal();
        });

        // Close modals on outside click
        ['settingsModal', 'libraryModal', 'importModal', 'celebrationModal'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', (e) => {
                if (e.target.id === id) {
                    document.getElementById(id).style.display = 'none';
                }
            });
        });
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new SQLConcentrationGame();
});
