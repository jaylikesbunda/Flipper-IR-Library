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
        
        // Hide welcome message when files are loaded
        this.hideWelcomeOnContent();
    }

    initializeUIElements() {
        // UI Elements
        this.connectBtn = document.getElementById('connectBtn');
        this.alertEl = document.getElementById('alert');
        this.statusEl = document.getElementById('status');
        this.irFilesEl = document.getElementById('irFiles');
        this.filterTypeEl = document.getElementById('filterType');
        this.filterValueEl = document.getElementById('filterValue');
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
            'connectBtn', 'alertEl', 'statusEl', 'irFilesEl', 'filterTypeEl',
            'filterValueEl', 'databaseFilesEl', 'loadingOverlay', 'loadingStatus',
            'localTab', 'databaseTab', 'homeTab', 'localContent', 'databaseContent',
            'homeContent', 'scanningIndicator', 'welcomeMessage'
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
        
        this.filterTypeEl.addEventListener('change', () => this.loadSharedFiles());
        this.filterValueEl.addEventListener('input', () => this.loadSharedFiles());
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
        
        // Add a class if metadata was guessed
        if (metadata.isGuessed) {
            card.classList.add('guessed-metadata');
        }
        
        card.innerHTML = `
            <div class="ir-info">
                <h3>${metadata.brand}</h3>
                <div class="metadata-badges">
                    <span class="badge device-type">${metadata.device_type}</span>
                    <span class="badge">${metadata.model}</span>
                    <span class="badge filename">${file.name}</span>
                    ${metadata.isGuessed ? '<span class="badge guessed">Guessed Metadata</span>' : ''}
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

    async loadSharedFiles() {
        try {
            document.getElementById('databaseLoadingState').style.display = 'block';
            document.getElementById('emptyDatabaseState').style.display = 'none';
            this.databaseFilesEl.innerHTML = '';
            
            const pageSize = 20;
            const filterType = this.filterTypeEl.value;
            const filterValue = this.filterValueEl.value.toLowerCase();
            
            // Use Firebase query operators for server-side filtering
            let query = firebase.database().ref('ir_files')
                .orderByChild(`metadata/${filterType}`)
                .limitToFirst(pageSize);
                
            if (filterValue) {
                query = query.startAt(filterValue)
                            .endAt(filterValue + '\uf8ff');
            }
            
            const snapshot = await query.once('value');
            const files = snapshot.val();
            
            if (!files || Object.keys(files).length === 0) {
                document.getElementById('emptyDatabaseState').style.display = 'block';
                return;
            }

            // Batch DOM updates
            const fragment = document.createDocumentFragment();
            Object.entries(files).forEach(([id, file]) => {
                const card = this.addDatabaseFileCard({ id, ...file });
                fragment.appendChild(card);
            });
            
            this.databaseFilesEl.innerHTML = '';
            this.databaseFilesEl.appendChild(fragment);
        } catch (err) {
            console.error('Failed to load shared files:', err);
            document.getElementById('databaseLoadingState').style.display = 'none';
            document.getElementById('emptyDatabaseState').style.display = 'block';
            this.showAlert('Failed to load shared files: ' + err.message);
        } finally {
            document.getElementById('databaseLoadingState').style.display = 'none';
        }
    }

    addDatabaseFileCard(file) {
        const card = document.createElement('div');
        card.className = 'ir-card';
        card.innerHTML = `
            <div class="ir-info">
                <h3>${file.metadata.brand}</h3>
                <div class="metadata-badges">
                    <span class="badge device-type">${file.metadata.device_type}</span>
                    <span class="badge">${file.metadata.model}</span>
                    <span class="badge filename">${file.name}</span>
                    <span class="badge date">${new Date(file.uploadedAt).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="button-group">
                <button class="download-btn">Download</button>
            </div>
        `;
        
        // Add download functionality
        const downloadBtn = card.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        
        return card;
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
}

// Initialize the application
const irBrowser = new FlipperIRBrowser();