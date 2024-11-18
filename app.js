class FlipperIRBrowser {
    constructor() {
        // Initialize UI Elements first
        this.initializeUIElements();

        // Check Web Serial API
        if (!navigator.serial) {
            this.showAlert('Web Serial API is not supported in this browser. Please use Chrome or Edge.', 'error');
            if (this.connectBtn) {
                this.connectBtn.disabled = true;
            }
            return;
        }

        if (!this.connectBtn) {
            console.error('Connect button not found!');
            return;
        }

        this.flipper = new FlipperSerial();
        this.connected = false;
        this.loading = false;

        // Add event listeners
        this.initializeEventListeners();
        
        // Initialize view state with defaults
        this.currentView = 'grid';
        this.currentSection = 'device_type';
        this.groupedFiles = null;
        this.selectedCategories = new Set();
        
        // Add view toggle handlers with improved error handling
        document.querySelectorAll('.view-toggle button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentView = btn.dataset.view;
                if (this.groupedFiles) {
                    this.refreshView();
                }
            });
        });

        // Set up section tabs with improved state management
        document.querySelectorAll('.section-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentSection = tab.dataset.section;
                if (this.groupedFiles) {
                    this.loadSection(this.currentSection);
                }
            });
        });

        // Add references to UI elements
        this.searchInput = document.getElementById('searchInput');
        this.activeGroupSelect = document.getElementById('activeGroup');
        this.categoryChipsEl = document.getElementById('categoryChips');

        // Initialize search and filter functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.filterFiles());
        }
        if (this.activeGroupSelect) {
            this.activeGroupSelect.addEventListener('change', () => this.filterFiles());
        }
    }

    initializeUIElements() {
        // UI Elements
        this.connectBtn = document.getElementById('connectBtn');
        this.alertEl = document.getElementById('alert');
        this.statusEl = document.getElementById('status');
        this.irFilesEl = document.getElementById('irFiles');
        this.databaseFilesEl = document.getElementById('databaseFiles');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingStatus = document.getElementById('loadingStatus');
        this.localTab = document.getElementById('localTab');
        this.databaseTab = document.getElementById('databaseTab');
        this.homeTab = document.getElementById('homeTab');
        this.localContent = document.getElementById('localContent');
        this.databaseContent = document.getElementById('databaseContent');
        this.homeContent = document.getElementById('homeContent');
        this.scanningIndicator = document.getElementById('scanningIndicator');
        this.welcomeMessage = document.getElementById('welcomeMessage');

        // Check if any required elements are missing
        const requiredElements = [
            'connectBtn', 'alertEl', 'statusEl', 'irFilesEl', 'databaseFilesEl', 
            'loadingOverlay', 'loadingStatus', 'localTab', 'databaseTab', 'homeTab', 
            'localContent', 'databaseContent', 'homeContent', 'scanningIndicator', 
            'welcomeMessage'
        ];

        requiredElements.forEach(elementId => {
            if (!this[elementId]) {
                console.error(`Required element not found: ${elementId}`);
            }
        });
    }

    initializeEventListeners() {
        // Add tab listeners
        this.localTab.addEventListener('click', () => this.switchTab('local'));
        this.databaseTab.addEventListener('click', () => this.switchTab('database'));
        this.homeTab.addEventListener('click', () => this.switchTab('home'));
        
        // Debug the button click directly
        this.connectBtn.addEventListener('click', () => {
            console.log('Connect button clicked');
            console.log('Current state:', {
                connected: this.connected,
                flipperConnected: this.flipper?.isConnected,
                buttonText: this.connectBtn.textContent
            });
            this.connectFlipper();
        });
    }


    setLoading(isLoading, status = 'Loading...') {
        this.loading = isLoading;
        if (!this.connected) {
            this.connectBtn.disabled = isLoading;
        }
        this.loadingOverlay.classList.toggle('active', isLoading);
        this.loadingStatus.textContent = status;
        this.scanningIndicator.style.display = isLoading ? 'flex' : 'none';
    }

    showAlert(message, type = 'error') {
        if (!this.alertEl) {
            console.error('Alert element not found!');
            console.error(message);
            return;
        }
        
        console.log(`Showing alert: ${message} (${type})`);
        this.alertEl.textContent = message;
        this.alertEl.className = `alert ${type}`;
        this.alertEl.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                if (this.alertEl) {
                    this.alertEl.style.display = 'none';
                    this.alertEl.className = 'alert';
                }
            }, 3000);
        }
    }

    async connectFlipper() {
        try {
            console.log('Button clicked');
            console.log('Current connection state:', this.connected, this.flipper.isConnected); 

            if (this.connected) {
                console.log('Entering disconnect flow');
                this.setLoading(true);
                
                try {
                    if (!this.flipper) {
                        console.error('No flipper instance!');
                        throw new Error('Flipper instance not initialized');
                    }
                    
                    await this.flipper.disconnect();
                    this.connected = false;
                    this.connectBtn.textContent = 'Connect Flipper';
                    this.connectBtn.classList.remove('connected');
                    this.irFilesEl.innerHTML = '';
                    this.showAlert('Disconnected from Flipper', 'success');
                } catch (err) {
                    console.error('Disconnect error:', err);
                    this.showAlert('Failed to disconnect: ' + err.message);
                } finally {
                    this.setLoading(false);
                }
                return;
            }

            this.setLoading(true);

            if (!this.flipper) {
                console.error('Flipper Serial instance not initialized');
                throw new Error('Internal error: Flipper Serial not initialized');
            }

            await this.flipper.connect();
            
            this.connected = true;
            this.flipper.isConnected = true;
            this.connectBtn.textContent = 'Disconnect';
            this.connectBtn.classList.add('connected');
            this.showAlert('Successfully connected to Flipper!', 'success');
            await this.loadIRFiles();
        } catch (err) {
            console.error('Connection error:', err);
            this.showAlert(`Failed to connect to Flipper: ${err.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    async loadIRFiles() {
        try {
            console.log('Starting to load IR files...');
            const emptyStateEl = document.getElementById('emptyLocalState');
            const loadingStateEl = document.getElementById('localLoadingState');
            
            this.irFilesEl.innerHTML = '';
            
            // Only show loading and attempt to scan if connected
            if (this.flipper && this.flipper.isConnected) {
                loadingStateEl.style.display = 'block';
                emptyStateEl.style.display = 'none';
                
                await this.scanDirectory('/ext/infrared');
                
                if (!this.irFilesEl.children.length) {
                    emptyStateEl.style.display = 'block';
                    this.showAlert('No IR files with valid metadata found in /ext/infrared/', 'error');
                } else {
                    emptyStateEl.style.display = 'none';
                    this.showAlert(`Found ${this.irFilesEl.children.length} IR files with metadata`, 'success');
                }
            } else {
                // Not connected, just show empty state
                loadingStateEl.style.display = 'none';
                emptyStateEl.style.display = 'block';
            }
        } catch (err) {
            console.error('Failed to load IR files:', err);
            loadingStateEl.style.display = 'none';
            emptyStateEl.style.display = 'block';
            if (this.flipper && this.flipper.isConnected) {
                this.showAlert('Failed to load IR files: ' + err.message);
            }
        }
    }

    async scanDirectory(path) {
        const files = await this.flipper.listDirectory(path);
        const irFiles = files.filter(f => f.name.endsWith('.ir') && !f.name.startsWith('.'));
        const directories = files.filter(f => f.isDirectory);
        
        // Cache path components and IRDB check once per directory
        const pathComponents = path.split('/').filter(p => p);
        const isInIRDB = pathComponents.some(comp => comp.toUpperCase() === 'IRDB');
        
        let processedFiles = 0;
        const totalFiles = irFiles.length;
        
        // Process files in parallel with a limit of 3 concurrent operations
        const processFile = async (file) => {
            processedFiles++;
            this.setLoading(true, `Reading file ${processedFiles}/${totalFiles} from ${path}`);
            
            try {
                const content = await this.flipper.readFile(file.path);
                let metadata = this.parseIRMetadata(content);
                
                if (metadata) {
                    this.addIRFileCard(file, metadata, content);
                    return;
                }
                
                // Only attempt guessing if not in IRDB
                if (!isInIRDB) {
                    metadata = this.guessMetadata(file.name, pathComponents);
                    if (metadata) {
                        this.addIRFileCard(file, metadata, content);
                    }
                }
            } catch (fileErr) {
                console.error(`Error reading ${file.name}:`, fileErr);
            }
        };

        // Process files in chunks of 3
        for (let i = 0; i < irFiles.length; i += 3) {
            const chunk = irFiles.slice(i, i + 3);
            await Promise.all(chunk.map(processFile));
        }

        // Process directories sequentially
        for (const dir of directories) {
            await this.scanDirectory(dir.path);
        }
    }

    parseIRMetadata(content) {
        const required = ['brand', 'device_type', 'model'];
        const metadata = {};
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length && required.length > 0; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#')) continue;
            
            const [key, ...valueParts] = line.substring(2).split(':');
            const cleanKey = key.toLowerCase().replace(/ /g, '_');
            
            if (required.includes(cleanKey)) {
                metadata[cleanKey] = valueParts.join(':').trim();
                required.splice(required.indexOf(cleanKey), 1);
            }
        }
        
        return required.length === 0 ? metadata : null;
    }

    addIRFileCard(file, metadata, content) {
        const card = document.createElement('div');
        card.className = 'ir-card';
        
        if (metadata.isGuessed) {
            card.classList.add('guessed-metadata');
        }
        
        card.innerHTML = `
            <div class="ir-info">
                <h3>${metadata.brand}</h3>
                <div class="metadata-badges">
                    <span class="badge device-type" title="Device Category">${metadata.device_type}</span>
                    <span class="badge brand" title="Manufacturer">${metadata.brand}</span>
                    <span class="badge model" title="Model Number">${metadata.model}</span>
                    ${metadata.protocol ? `<span class="badge protocol" title="IR Protocol">${metadata.protocol}</span>` : ''}
                    <span class="badge filename" title="File: ${file.path}">${file.name}</span>
                    ${metadata.isGuessed ? '<span class="badge warning" title="Metadata was automatically detected">Guessed Metadata</span>' : ''}
                    ${file.size ? `<span class="badge size" title="File Size">${this.formatFileSize(file.size)}</span>` : ''}
                </div>
                <p class="file-path">${file.path}</p>
            </div>
            <div class="button-group">
                ${metadata.isGuessed ? 
                    '<button class="confirm-metadata-btn">Confirm Metadata</button>' : 
                    '<button class="share-btn">Share to Database</button>'
                }
            </div>
        `;
        
        // Add event listeners
        if (metadata.isGuessed) {
            const confirmBtn = card.querySelector('.confirm-metadata-btn');
            confirmBtn.addEventListener('click', () => {
                this.confirmMetadata(file, metadata, content, card);
            });
        } else {
            const shareBtn = card.querySelector('.share-btn');
            shareBtn.addEventListener('click', () => {
                this.uploadToDatabase(file, metadata, content);
            });
        }
        
        this.irFilesEl.appendChild(card);
    }

    async confirmMetadata(file, metadata, content, card) {
        // After successful confirmation, update the card to match normal files
        try {
            await this.saveMetadataToFile(file.path, content, metadata);
            
            // Update the card UI
            card.classList.remove('guessed-metadata');
            const buttonGroup = card.querySelector('.button-group');
            buttonGroup.innerHTML = '<button class="share-btn">Share to Database</button>';
            
            // Remove the guessed badge
            card.querySelector('.badge.guessed')?.remove();
            
            // Add share button listener
            const shareBtn = buttonGroup.querySelector('.share-btn');
            shareBtn.addEventListener('click', () => {
                this.uploadToDatabase(file, metadata, content);
            });
            
            this.showAlert('Metadata saved successfully!', 'success');
        } catch (err) {
            this.showAlert('Failed to save metadata: ' + err.message);
        }
    }

    async uploadToDatabase(file, metadata, content) {
        try {
            // Check if user is authenticated
            if (!firebase.auth().currentUser) {
                // Sign in anonymously
                await firebase.auth().signInAnonymously();
            }
            
            const irRef = firebase.database().ref('ir_files');
            await irRef.push({
                name: file.name,
                metadata: metadata,
                content: content,
                uploadedAt: firebase.database.ServerValue.TIMESTAMP
            });
            this.showAlert('Successfully shared to database!', 'success');
        } catch (err) {
            console.error('Upload failed:', err);
            this.showAlert('Failed to share to database: ' + err.message);
        }
    }

    // Simplified view refresh logic
    refreshView() {
        if (!this.groupedFiles) {
            console.warn('No files loaded to display');
            return;
        }

        const files = this.currentSection === 'all' 
            ? this.groupedFiles.all
            : this.groupedFiles[this.currentSection];

        this.displayFiles(files);
    }

    // Improved section loading
    loadSection(section) {
        if (!this.groupedFiles) return;

        this.currentSection = section;
        
        // Update UI state
        this.updateCategoryChips(this.groupedFiles);
        this.displayFiles(this.groupedFiles[section]);

        // Reset filters
        if (this.searchInput) this.searchInput.value = '';
        if (this.activeGroupSelect) this.activeGroupSelect.value = '';
    }

    // Improved file display logic
    displayFiles(files) {
        if (!this.databaseFilesEl) {
            console.error('Database files element not found');
            return;
        }

        // Clear current display
        this.databaseFilesEl.innerHTML = '';
        
        if (!files || typeof files !== 'object') {
            console.warn('Invalid files data:', files);
            return;
        }

        // Handle different section types
        if (this.currentSection === 'all') {
            // Display all files directly
            Object.values(files).forEach(file => {
                const card = this.addDatabaseFileCard(file, this.currentView);
                if (card) {
                    this.databaseFilesEl.appendChild(card);
                }
            });
        } else {
            // Display grouped files
            Object.values(files).forEach(groupFiles => {
                if (!groupFiles || typeof groupFiles !== 'object') return;
                
                Object.values(groupFiles).forEach(file => {
                    const card = this.addDatabaseFileCard(file, this.currentView);
                    if (card) {
                        this.databaseFilesEl.appendChild(card);
                    }
                });
            });
        }
    }

    // Improved shared files loading
    async loadSharedFiles() {
        try {
            const databaseLoadingState = document.getElementById('databaseLoadingState');
            const emptyDatabaseState = document.getElementById('emptyDatabaseState');
            
            if (!databaseLoadingState || !emptyDatabaseState) {
                console.error('Required elements not found');
                return;
            }

            databaseLoadingState.style.display = 'block';
            emptyDatabaseState.style.display = 'none';
            this.databaseFilesEl.innerHTML = '';
            
            // Get all files
            const snapshot = await firebase.database().ref('ir_files').once('value');
            const files = snapshot.val() || {};
            
            if (!Object.keys(files).length) {
                emptyDatabaseState.style.display = 'block';
                return;
            }

            // Group files and update state
            this.groupedFiles = this.groupFilesByMetadata(files);
            
            // Update UI
            this.updateSectionCounts(this.groupedFiles);
            this.loadSection(this.currentSection);
            
        } catch (err) {
            console.error('Failed to load shared files:', err);
            this.showAlert('Failed to load shared files: ' + err.message);
        } finally {
            document.getElementById('databaseLoadingState').style.display = 'none';
        }
    }

    updateSectionCounts(groupedFiles) {
        document.querySelectorAll('.section-tab').forEach(tab => {
            const section = tab.dataset.section;
            const count = Object.keys(groupedFiles[section]).length;
            tab.querySelector('.count').textContent = count;
        });
    }

    setupSectionTabs(groupedFiles) {
        const tabs = document.querySelectorAll('.section-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadSection(tab.dataset.section, groupedFiles);
            });
        });
    }

    groupFilesByMetadata(files) {
        const grouped = {
            device_type: {},
            brand: {},
            all: files
        };
        
        Object.entries(files).forEach(([id, file]) => {
            const { metadata } = file;
            if (!metadata) return;
            
            // Group by device type
            if (metadata.device_type) {
                if (!grouped.device_type[metadata.device_type]) {
                    grouped.device_type[metadata.device_type] = {};
                }
                grouped.device_type[metadata.device_type][id] = file;
            }
            
            // Group by brand
            if (metadata.brand) {
                if (!grouped.brand[metadata.brand]) {
                    grouped.brand[metadata.brand] = {};
                }
                grouped.brand[metadata.brand][id] = file;
            }
        });
        
        return grouped;
    }

    switchTab(tab) {
        // First hide all content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected content and activate tab
        switch(tab) {
            case 'local':
                this.localTab.classList.add('active');
                this.localContent.style.display = 'block';
                const emptyStateEl = document.getElementById('emptyLocalState');
                
                // Only show empty state if we're not connected OR we have no files
                if (!this.flipper?.isConnected) {
                    emptyStateEl.style.display = 'block';
                } else if (!this.irFilesEl.children.length) {
                    this.loadIRFiles();
                }
                break;
            case 'database':
                this.databaseTab.classList.add('active');
                this.databaseContent.style.display = 'block';
                this.loadSharedFiles();
                break;
            case 'home':
                this.homeTab.classList.add('active');
                this.homeContent.style.display = 'block';
                break;
        }
    }

    guessMetadata(filename, pathComponents) {
        // Cache the device type map
        if (!this.deviceTypeMap) {
            this.deviceTypeMap = {
                'ACS': 'AC',
                'AIR_PURIFIERS': 'Air Purifier',
                'AUDIO_AND_VIDEO_RECEIVERS': 'AV Receiver',
                'BIDET': 'Bidet',
                'BLU-RAY': 'Blu-Ray',
                'CCTV': 'CCTV',
                'CD_PLAYERS': 'CD Player',
                'CABLE_BOXES': 'Cable Box',
                'CAMERAS': 'Camera',
                'CAR_MULTIMEDIA': 'Car Multimedia',
                'CONSOLES': 'Game Console',
                'CONVERTERS': 'Converter',
                'DVB-T': 'DVB-T',
                'DVD_PLAYERS': 'DVD Player',
                'DIGITAL_SIGNS': 'Digital Sign',
                'FANS': 'Fan',
                'FIREPLACES': 'Fireplace',
                'HEAD_UNITS': 'Head Unit',
                'HEATERS': 'Heater',
                'HUMIDIFIERS': 'Humidifier',
                'LED_LIGHTING': 'LED Light',
                'MONITORS': 'Monitor',
                'PROJECTORS': 'Projector',
                'SOUNDBARS': 'Soundbar',
                'SPEAKERS': 'Speaker',
                'STREAMING_DEVICES': 'Streaming Device',
                'TVS': 'TV',
                'VACUUM_CLEANERS': 'Vacuum',
                'VIDEOCONFERENCING': 'Video Conference'
            };
        }
        
        // Remove .ir extension and split by underscore once
        const parts = filename.replace('.ir', '').split('_');
        if (parts.length < 2) return null;
        
        // Find device type in path
        let deviceType = null;
        for (const component of pathComponents) {
            const upperComponent = component.toUpperCase().replace(/\s+/g, '_');
            if (this.deviceTypeMap[upperComponent]) {
                deviceType = this.deviceTypeMap[upperComponent];
                break;
            }
        }
        
        if (!deviceType) return null;
        
        const brand = parts[0].toUpperCase();
        const model = parts.slice(1).join('_').toUpperCase();
        
        // Cache regex patterns
        if (!this.modelPatterns) {
            this.modelPatterns = [
                /^[A-Z]{0,3}\d{2,3}[A-Z]{2,3}\d{3,4}[A-Z]?$/,
                /^[A-Z]+\d{3,4}[A-Z]?$/,
                /^[A-Z]{2,3}\d{2,3}[A-Z]\d{2,3}[A-Z]?(_20\d{2})?$/
            ];
            this.brandPattern = /^[A-Z]{2,15}$/;
        }
        
        // Quick validation before more expensive regex tests
        if (!this.brandPattern.test(brand)) return null;
        
        // Test model patterns
        if (!this.modelPatterns.some(pattern => pattern.test(model))) return null;
        
        return {
            brand,
            model,
            device_type: deviceType,
            isGuessed: true
        };
    }

    async confirmGuessedMetadata(filename, metadata) {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'metadata-dialog';
            dialog.innerHTML = `
                <div class="metadata-dialog-content">
                    <h3>Guessed Metadata for ${filename}</h3>
                    <p>We found no metadata in the file but guessed the following:</p>
                    <div class="metadata-fields">
                        <div class="field">
                            <label>Brand:</label>
                            <input type="text" id="brand" value="${metadata.brand}">
                        </div>
                        <div class="field">
                            <label>Model:</label>
                            <input type="text" id="model" value="${metadata.model}">
                        </div>
                        <div class="field">
                            <label>Device Type:</label>
                            <input type="text" id="device_type" value="${metadata.device_type}">
                        </div>
                    </div>
                    <div class="dialog-buttons">
                        <button class="confirm-btn">Confirm</button>
                        <button class="cancel-btn">Skip</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            const confirmBtn = dialog.querySelector('.confirm-btn');
            const cancelBtn = dialog.querySelector('.cancel-btn');
            
            confirmBtn.addEventListener('click', () => {
                metadata.brand = dialog.querySelector('#brand').value;
                metadata.model = dialog.querySelector('#model').value;
                metadata.device_type = dialog.querySelector('#device_type').value;
                document.body.removeChild(dialog);
                resolve(true);
            });
            
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(false);
            });
        });
    }

    async saveMetadataToFile(path, content, metadata) {
        // Add metadata comments at the start of the file
        const metadataComments = [
            '# Brand: ' + metadata.brand,
            '# Model: ' + metadata.model,
            '# Device Type: ' + metadata.device_type
        ].join('\n');
        
        // Find the position after Filetype and Version headers
        const lines = content.split('\n');
        let insertPosition = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('Version:')) {
                insertPosition = i + 1;
                break;
            }
        }
        
        // Insert metadata
        lines.splice(insertPosition, 0, metadataComments);
        const newContent = lines.join('\n');
        
        // Save back to file
        await this.flipper.writeFile(path, newContent);
    }

    // Add helper method for file size formatting
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    addDatabaseFileCard(file, viewType = 'grid') {
        // Add validation check at the start
        if (!file || !file.metadata) {
            console.error('Invalid file data:', file);
            return null;
        }

        const { metadata } = file;
        // Ensure all required metadata fields exist with fallbacks
        const safeMetadata = {
            brand: metadata.brand || 'Unknown Brand',
            device_type: metadata.device_type || 'Unknown Type',
            model: metadata.model || 'Unknown Model',
            protocol: metadata.protocol || 'Unknown'
        };

        let element;
        
        if (viewType === 'list') {
            element = document.createElement('div');
            element.className = 'ir-list-item';
            
            element.innerHTML = `
                <div class="item-info">
                    <span class="filename">${file.name || 'Unnamed File'}</span>
                    <div class="metadata-pills">
                        <span class="pill">${safeMetadata.brand}</span>
                        <span class="pill">${safeMetadata.device_type}</span>
                        <span class="pill">${safeMetadata.model}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="download-btn" title="Download to computer">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z" fill="currentColor"/>
                            <path d="M2 13h12v2H2z" fill="currentColor"/>
                        </svg>
                    </button>
                    <button class="send-to-flipper-btn" title="Send to Flipper">
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M8 1L5 4h2v8h2V4h2L8 1z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            `;
        } else {
            element = document.createElement('div');
            element.className = 'ir-card';
            
            element.innerHTML = `
                <div class="ir-info">
                    <h3>${safeMetadata.brand}</h3>
                    <div class="metadata-badges">
                        <span class="badge device-type" title="Device Category">${safeMetadata.device_type}</span>
                        <span class="badge model" title="Model">${safeMetadata.model}</span>
                        <span class="badge protocol" title="Protocol">${safeMetadata.protocol}</span>
                    </div>
                    <span class="filename">${file.name || 'Unnamed File'}</span>
                    <div class="button-group">
                        <button class="download-btn">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z" fill="currentColor"/>
                                <path d="M2 13h12v2H2z" fill="currentColor"/>
                            </svg>
                            Download
                        </button>
                        <button class="send-to-flipper-btn">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M8 1L5 4h2v8h2V4h2L8 1z" fill="currentColor"/>
                            </svg>
                            Send to Flipper
                        </button>
                    </div>
                </div>
            `;
        }

        // Add download handler
        const downloadBtn = element.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        });

        // Add send to flipper handler
        const sendToFlipperBtn = element.querySelector('.send-to-flipper-btn');
        sendToFlipperBtn.addEventListener('click', async () => {
            try {
                if (!this.flipper.isConnected) {
                    throw new Error('Please connect your Flipper Zero first');
                }
                
                const savePath = `/ext/infrared/${file.name}`;
                await this.flipper.writeFile(savePath, file.content);
                this.showAlert('File sent to Flipper successfully!', 'success');
                
                // Refresh local files to show the new file
                await this.scanDirectory('/ext/infrared');
            } catch (err) {
                console.error('Send to Flipper failed:', err);
                this.showAlert('Failed to send file to Flipper: ' + err.message);
            }
        });
        
        return element;
    }

    // Updated method to handle category chips
    updateCategoryChips(files) {
        if (!this.categoryChipsEl) return;
        this.categoryChipsEl.innerHTML = '';
        
        // Get categories based on current section
        const categories = new Set();
        const categoryCounts = new Map();

        // Extract categories from files
        Object.values(files[this.currentSection] || {}).forEach(groupFiles => {
            Object.values(groupFiles).forEach(file => {
                if (!file.metadata) return;
                
                const category = file.metadata[this.currentSection];
                if (category) {
                    categories.add(category);
                    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
                }
            });
        });

        // Update dropdown options
        if (this.activeGroupSelect) {
            this.activeGroupSelect.innerHTML = `
                <option value="">All Categories</option>
                ${Array.from(categories).sort().map(category => 
                    `<option value="${category}">${category} (${categoryCounts.get(category)})</option>`
                ).join('')}
            `;
        }

        // Create category chips
        Array.from(categories).sort().forEach(category => {
            const chip = document.createElement('div');
            chip.className = 'category-chip';
            chip.dataset.category = category;
            chip.innerHTML = `
                ${category}
                <span class="count">${categoryCounts.get(category)}</span>
            `;
            
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                this.filterFiles();
            });
            
            this.categoryChipsEl.appendChild(chip);
        });
    }

    // Improved filter method
    filterFiles() {
        if (!this.groupedFiles || !this.databaseFilesEl) return;

        const searchTerm = this.searchInput?.value.toLowerCase() || '';
        const selectedGroup = this.activeGroupSelect?.value || '';
        const activeChips = Array.from(this.categoryChipsEl?.querySelectorAll('.category-chip.active') || [])
            .map(chip => chip.dataset.category);

        // Clear current display
        this.databaseFilesEl.innerHTML = '';

        const files = this.groupedFiles[this.currentSection];
        if (!files) return;

        // Filter and display files
        Object.entries(files).forEach(([group, groupFiles]) => {
            // Skip if a group is selected and doesn't match
            if (selectedGroup && group !== selectedGroup) return;

            Object.values(groupFiles).forEach(file => {
                if (!file.metadata) return;

                // Check if file matches all active filters
                const matchesSearch = !searchTerm || 
                    file.name.toLowerCase().includes(searchTerm) ||
                    file.metadata.brand.toLowerCase().includes(searchTerm) ||
                    file.metadata.model.toLowerCase().includes(searchTerm) ||
                    file.metadata.device_type.toLowerCase().includes(searchTerm);

                const matchesCategories = activeChips.length === 0 || 
                    activeChips.includes(file.metadata[this.currentSection]);

                if (matchesSearch && matchesCategories) {
                    const card = this.addDatabaseFileCard(file, this.currentView);
                    if (card) {
                        this.databaseFilesEl.appendChild(card);
                    }
                }
            });
        });
    }
}
// Initialize the application
const irBrowser = new FlipperIRBrowser();
