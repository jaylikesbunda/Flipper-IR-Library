class FileManager {
    constructor(flipper, showAlert) {
        this.flipper = flipper;
        this.showAlert = showAlert;
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
        this.modelPatterns = [
            /^[A-Z]{0,3}\d{2,3}[A-Z]{2,3}\d{3,4}[A-Z]?$/,
            /^[A-Z]+\d{3,4}[A-Z]?$/,
            /^[A-Z]{2,3}\d{2,3}[A-Z]\d{2,3}[A-Z]?(_20\d{2})?$/
        ];
        this.brandPattern = /^[A-Z]{2,15}$/;
    }

    async scanDirectory(path) {
        const files = await this.flipper.listDirectory(path);
        const irFiles = files.filter(f => f.name.endsWith('.ir') && !f.name.startsWith('.'));
        const directories = files.filter(f => f.isDirectory);
        
        const pathComponents = path.split('/').filter(p => p);
        const isInIRDB = pathComponents.some(comp => comp.toUpperCase() === 'IRDB');
        
        let processedFiles = 0;
        const totalFiles = irFiles.length;
        
        const processFile = async (file) => {
            processedFiles++;
            
            try {
                const content = await this.flipper.readFile(file.path);
                let metadata = this.parseIRMetadata(content);
                
                if (metadata) {
                    return { file, metadata, content };
                }
                
                if (!isInIRDB) {
                    metadata = this.guessMetadata(file.name, pathComponents);
                    if (metadata) {
                        return { file, metadata, content };
                    }
                }
            } catch (fileErr) {
                console.error(`Error reading ${file.name}:`, fileErr);
            }
            return null;
        };

        const results = [];
        for (let i = 0; i < irFiles.length; i += 3) {
            const chunk = irFiles.slice(i, i + 3);
            const chunkResults = await Promise.all(chunk.map(processFile));
            results.push(...chunkResults.filter(r => r !== null));
        }

        for (const dir of directories) {
            const dirResults = await this.scanDirectory(dir.path);
            results.push(...dirResults);
        }

        return results;
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

    guessMetadata(filename, pathComponents) {
        const parts = filename.replace('.ir', '').split('_');
        if (parts.length < 2) return null;
        
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
        
        if (!this.brandPattern.test(brand)) return null;
        if (!this.modelPatterns.some(pattern => pattern.test(model))) return null;
        
        return {
            brand,
            model,
            device_type: deviceType,
            isGuessed: true
        };
    }

    async saveMetadataToFile(path, content, metadata) {
        const metadataComments = [
            '# Brand: ' + metadata.brand,
            '# Model: ' + metadata.model,
            '# Device Type: ' + metadata.device_type
        ].join('\n');
        
        const lines = content.split('\n');
        let insertPosition = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('Version:')) {
                insertPosition = i + 1;
                break;
            }
        }
        
        lines.splice(insertPosition, 0, metadataComments);
        const newContent = lines.join('\n');
        
        await this.flipper.writeFile(path, newContent);
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
            
            if (metadata.device_type) {
                if (!grouped.device_type[metadata.device_type]) {
                    grouped.device_type[metadata.device_type] = {};
                }
                grouped.device_type[metadata.device_type][id] = file;
            }
            
            if (metadata.brand) {
                if (!grouped.brand[metadata.brand]) {
                    grouped.brand[metadata.brand] = {};
                }
                grouped.brand[metadata.brand][id] = file;
            }
        });
        
        return grouped;
    }
}

export default FileManager; 