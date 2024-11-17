class FlipperIRBrowser {
    constructor() {
        this.flipper = new FlipperSerial();
        this.connected = false;
        this.loading = false;

        // UI Elements
        this.connectBtn = document.getElementById('connectBtn');
        this.alertEl = document.getElementById('alert');
        this.statusEl = document.getElementById('status');
        this.irFilesEl = document.getElementById('irFiles');
        this.filterTypeEl = document.getElementById('filterType');
        this.filterValueEl = document.getElementById('filterValue');
        this.databaseFilesEl = document.getElementById('databaseFiles');

        // Add loading overlay elements
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingStatus = document.getElementById('loadingStatus');
        
        // Add tab elements
        this.localTab = document.getElementById('localTab');
        this.databaseTab = document.getElementById('databaseTab');
        this.localContent = document.getElementById('localContent');
        this.databaseContent = document.getElementById('databaseContent');
        
        // Add tab listeners
        this.localTab.addEventListener('click', () => this.switchTab('local'));
        this.databaseTab.addEventListener('click', () => this.switchTab('database'));
        
        // Bind event listeners
        this.connectBtn.addEventListener('click', () => this.connectFlipper());
        this.filterTypeEl.addEventListener('change', () => this.loadSharedFiles());
        this.filterValueEl.addEventListener('input', () => this.loadSharedFiles());

        this.scanningIndicator = document.getElementById('scanningIndicator');
    }

    setLoading(isLoading, status = 'Loading...') {
        this.loading = isLoading;
        this.connectBtn.disabled = isLoading;
        this.loadingOverlay.classList.toggle('active', isLoading);
        this.loadingStatus.textContent = status;
        this.scanningIndicator.style.display = isLoading ? 'flex' : 'none';
    }

    showAlert(message, type = 'error') {
        this.alertEl.textContent = message;
        this.alertEl.className = `alert ${type}`;
        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.alertEl.className = 'alert';
            }, 3000);
        }
    }

    async connectFlipper() {
        if (this.connected) {
            try {
                await this.flipper.disconnect();
                this.connected = false;
                this.connectBtn.textContent = 'Connect Flipper';
                this.connectBtn.classList.remove('connected');
                this.showAlert('Disconnected from Flipper', 'success');
            } catch (err) {
                this.showAlert('Failed to disconnect: ' + err.message);
            }
            return;
        }

        this.setLoading(true);
        try {
            await this.flipper.connect();
            this.connected = true;
            this.connectBtn.textContent = 'Disconnect';
            this.connectBtn.classList.add('connected');
            this.showAlert('Successfully connected to Flipper!', 'success');
            this.loadIRFiles();
        } catch (err) {
            this.showAlert('Failed to connect to Flipper. Please make sure it is connected via USB.');
        } finally {
            this.setLoading(false);
        }
    }

    async loadIRFiles() {
        try {
            console.log('Starting to load IR files...');
            await this.scanDirectory('/ext/infrared');
            
            if (this.irFilesEl.children.length === 0) {
                this.showAlert('No IR files with valid metadata found in /ext/infrared/', 'error');
            } else {
                this.showAlert(`Found ${this.irFilesEl.children.length} IR files with metadata`, 'success');
            }
        } catch (err) {
            console.error('Failed to load IR files:', err);
            console.error('Full error:', err);
            this.showAlert('Failed to load IR files: ' + err.message);
            this.statusEl.textContent = '';
        }
    }

    async scanDirectory(path) {
        const files = await this.flipper.listDirectory(path);
        const irFiles = files.filter(f => f.name.endsWith('.ir') && !f.name.startsWith('.'));
        const directories = files.filter(f => f.isDirectory);
        
        // Skip single-file directory recursion
        if (directories.length === 1 && irFiles.length === 0) {
            const subFiles = await this.flipper.listDirectory(directories[0].path);
            const subIRFiles = subFiles.filter(f => f.name.endsWith('.ir') && !f.name.startsWith('.'));
            
            if (subIRFiles.length === 1) {
                // Process single file directly
                this.setLoading(true, `Reading file from ${directories[0].path}`);
                try {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const file = subIRFiles[0];
                    await this.flipper.write(`storage read ${file.path}\r\n`, 50);
                    await this.flipper.readUntil(`storage read ${file.path}`, 2500);
                    await this.flipper.readUntil('\n', 1500);
                    
                    const content = await this.flipper.readUntil('>', 4000);
                    const metadata = this.parseIRMetadata(content);
                    if (metadata) {
                        this.addIRFileCard(file, metadata, content);
                    }
                } catch (fileErr) {
                    console.error(`Error reading single file:`, fileErr);
                }
                return;
            }
        }
        
        // Regular directory processing
        let processedFiles = 0;
        const totalFiles = irFiles.length;
        
        // Process files
        for (const file of irFiles) {
            processedFiles++;
            this.setLoading(true, `Reading file ${processedFiles}/${totalFiles} from ${path}`);
            
            try {
                await new Promise(resolve => setTimeout(resolve, 200));
                await this.flipper.write(`storage read ${file.path}\r\n`, 50);
                await this.flipper.readUntil(`storage read ${file.path}`, 2500);
                await this.flipper.readUntil('\n', 1500);
                
                const content = await this.flipper.readUntil('>', 4000);
                const metadata = this.parseIRMetadata(content);
                if (metadata) {
                    this.addIRFileCard(file, metadata, content);
                }
            } catch (fileErr) {
                console.error(`Error reading ${file.name}:`, fileErr);
            }
        }
        
        // Process directories
        for (const dir of directories) {
            await this.scanDirectory(dir.path);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (path === '/ext/infrared') {
            this.setLoading(false);
        }
    }

    parseIRMetadata(content) {
        const metadata = {};
        // Only look at lines at start of file that begin with #
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#')) {
                continue;
            }
            
            const [key, ...valueParts] = line.substring(2).split(':');
            if (key && valueParts.length > 0) {
                const value = valueParts.join(':').trim(); // Rejoin in case value contained colons
                metadata[key.toLowerCase().replace(/ /g, '_')] = value;
            }
        }
        
        // Only return if we have required metadata fields
        if (metadata.brand && 
            metadata.device_type && 
            metadata.model) {
            return metadata;
        }
        return null;
    }

    addIRFileCard(file, metadata, content) {
        const card = document.createElement('div');
        card.className = 'ir-card';
        card.innerHTML = `
            <div class="ir-info">
                <h3>${metadata.brand}</h3>
                <div class="metadata-badges">
                    <span class="badge device-type">${metadata.device_type}</span>
                    <span class="badge">${metadata.model}</span>
                    <span class="badge filename">${file.name}</span>
                </div>
            </div>
            <div class="button-group">
                <button class="share-btn">Share to Database</button>
            </div>
        `;
        
        // Add event listener after creating the element
        const shareBtn = card.querySelector('.share-btn');
        shareBtn.addEventListener('click', () => {
            this.uploadToDatabase(file, metadata, content);
        });
        
        this.irFilesEl.appendChild(card);
    }

    async sendIRSignal(filePath) {
        if (!this.connected || this.loading) return;

        this.setLoading(true);
        try {
            await this.flipper.loaderOpen('IR Remote', filePath);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.flipper.loaderSignal('send');
            await this.flipper.loaderClose();
            this.showAlert('IR signal sent successfully!', 'success');
        } catch (err) {
            this.showAlert('Failed to send IR signal: ' + err.message);
        } finally {
            this.setLoading(false);
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
            const irRef = firebase.database().ref('ir_files');
            const snapshot = await irRef.once('value');
            const files = snapshot.val();
            
            if (!files) {
                this.databaseFilesEl.innerHTML = '<p>No shared files found</p>';
                return;
            }

            // Convert to array and add IDs
            const filesArray = Object.entries(files).map(([id, file]) => ({
                id,
                ...file
            }));

            // Apply filters
            const filterType = this.filterTypeEl.value;
            const filterValue = this.filterValueEl.value.toLowerCase();
            
            const filteredFiles = filesArray.filter(file => {
                if (!filterValue) return true;
                return file.metadata[filterType]?.toLowerCase().includes(filterValue);
            });

            // Sort by metadata fields
            filteredFiles.sort((a, b) => {
                const aValue = a.metadata[filterType]?.toLowerCase() || '';
                const bValue = b.metadata[filterType]?.toLowerCase() || '';
                return aValue.localeCompare(bValue);
            });

            // Display files
            this.databaseFilesEl.innerHTML = '';
            filteredFiles.forEach(file => {
                this.addDatabaseFileCard(file);
            });
        } catch (err) {
            console.error('Failed to load shared files:', err);
            this.showAlert('Failed to load shared files: ' + err.message);
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
        
        this.databaseFilesEl.appendChild(card);
    }

    switchTab(tab) {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        // Update tab content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.id === `${tab}Content`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        
        // Update active tab
        document.getElementById(`${tab}Tab`).classList.add('active');
        
        // Load database content if needed
        if (tab === 'database' && this.databaseFilesEl.children.length === 0) {
            this.loadSharedFiles();
        }
    }
}

// Initialize the application
const irBrowser = new FlipperIRBrowser();