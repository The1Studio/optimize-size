# File Size Analyzer

Build Size Optimization Tool for Cocos Playable Ads

## Features

- **Statistics Dashboard**: Analyze file sizes, view distribution by type, folder structure
- **Theme Support**: Light/Dark theme with persistent storage
- **Auto-reload**: Development mode with automatic server restart
- **Optimization Tools**: Placeholder for future optimization features

## Installation

```bash
npm install
```

## Usage

### Development Mode (with auto-reload)
```bash
npm run dev
```
Server will automatically restart when you modify files.

### Production Mode
```bash
npm start
```

The app will open at `http://localhost:3456`

## How to Use

1. **Statistics Tab**:
   - View total size, file count, folder count
   - Search and filter files
   - Sort by size or name
   - View file distribution by type
   - Explore folder structure
   - Get optimization recommendations

2. **Optimize Tab**:
   - Future optimization tools will be added here
   - Image compression
   - Script minification
   - Audio optimization
   - Unused assets cleanup

3. **Theme Toggle**:
   - Click the sun/moon icon in the header to switch themes
   - Your preference is saved automatically

## Project Structure

```
optimize-size/
├── app.js              # Main server file
├── package.json        # Dependencies and scripts
├── nodemon.json        # Nodemon configuration
├── .gitignore          # Git ignore rules
├── README.md           # This file
├── src/
│   └── scanner.js      # File scanning logic
└── public/
    ├── index.html      # Main HTML
    ├── styles.css      # Theme styles
    └── client.js       # Frontend logic
```

## Configuration

The tool scans the `../../assets` directory by default. To change this, edit `ROOT_DIR` in `app.js`:

```javascript
const ROOT_DIR = path.resolve(__dirname, '../../assets');
```

## Technologies

- **Backend**: Node.js HTTP server
- **Frontend**: Vanilla JavaScript, CSS Variables
- **Dev Tools**: Nodemon for auto-reload

## License

MIT
