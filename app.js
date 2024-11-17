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

        // Bind event listeners
        this.connectBtn.addEventListener('click', () => this.connectFlipper());
        this.filterTypeEl.addEventListener('change', () => this.loadSharedFiles());
        this.filterValueEl.addEventListener('input', () => this.loadSharedFiles());

        // Load shared files on startup
        this.loadSharedFiles();
    }

    setLoading(isLoading) {
        this.loading = isLoading;
        this.connectBtn.disabled = isLoading || this.connected;
        if (isLoading) {
            document.body.classList.add('loading');
        } else {
            document.body.classList.remove('loading');
        }
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
        this.setLoading(true);
        try {
            await this.flipper.connect();
            this.connected = true;
            this.connectBtn.textContent = 'Connected';
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
            const files = await this.flipper.listDirectory('/ext/infrared');
            console.log('Files found:', files);
            this.irFilesEl.innerHTML = '';
            
            this.statusEl.textContent = 'Scanning IR files...';
            
            for (const file of files) {
                if (!file.isDirectory && file.name.endsWith('.ir') && !file.name.startsWith('.')) {
                    console.log(`Attempting to read file: ${file.name} at path: ${file.path}`);
                    try {
                        await this.flipper.write(`storage read ${file.path}\r\n`);
                        console.log(`Sent read command for ${file.name}`);
                        
                        await this.flipper.readUntil(`storage read ${file.path}`);
                        console.log(`Got command echo for ${file.name}`);
                        
                        await this.flipper.readUntil('\n');
                        console.log(`Skipped size line for ${file.name}`);
                        
                        const content = await this.flipper.readUntil('>');
                        console.log(`File content for ${file.name}:`, content);
                        
                        this.statusEl.textContent = `Reading ${file.name}...`;
                        
                        const metadata = this.parseIRMetadata(content);
                        if (metadata) {
                            this.addIRFileCard(file, metadata, content);
                            console.log('Found metadata:', metadata);
                        } else {
                            console.log('No metadata found in:', file.name);
                        }
                    } catch (fileErr) {
                        console.error(`Error reading ${file.name}:`, fileErr);
                        console.error('Full error:', fileErr);
                    }
                }
            }
            
            this.statusEl.textContent = '';

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
                <p>${metadata.device_type} - ${metadata.model}</p>
                <span class="filename">${file.name}</span>
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
                <p>${file.metadata.device_type} - ${file.metadata.model}</p>
                <span class="filename">${file.name}</span>
                <span class="upload-date">${new Date(file.uploadedAt).toLocaleDateString()}</span>
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
}

// Initialize the application
const irBrowser = new FlipperIRBrowser();