# Direct Tab Linking Feature

## Overview
You can now link directly to any tab in the Midiano v2 application using URL paths. This allows you to share specific sections of the app with others or bookmark your favorite tabs.

## Available Routes

### Main Tabs
- **Synthesizer (Default)**: `http://your-domain.com/` or `http://your-domain.com`
- **Scales**: `http://your-domain.com/scales`
- **Chords**: `http://your-domain.com/chords`
- **Progressions**: `http://your-domain.com/progressions`
- **Fretboard**: `http://your-domain.com/fretboard`
- **Cross Reference**: `http://your-domain.com/crossreference`
- **Interval Practice**: `http://your-domain.com/intervals`

### Settings Tabs
- **About**: `http://your-domain.com/about`
- **Mode Settings**: `http://your-domain.com/mode`
- **Root Settings**: `http://your-domain.com/root`
- **Progression Settings**: `http://your-domain.com/progression-settings`
- **Chord Settings**: `http://your-domain.com/chord-settings`
- **General Settings**: `http://your-domain.com/general`
- **Synth Settings**: `http://your-domain.com/synth`
- **Octave Settings**: `http://your-domain.com/octave`

## Usage Examples

### Sharing a specific tab
If you want to direct someone to the Scales tab:
```
Send them: http://your-domain.com/scales
```

### Bookmarking your workflow
If you frequently use the Chord Progressions tab:
```
Bookmark: http://your-domain.com/progressions
```

### In development
During development, you'll see a "Direct Tab Links" helper panel in the top-right corner that shows:
- Current URL path
- Buttons to navigate to any tab
- A "Copy Current URL" button to easily share the current tab

## Technical Details

### How it works
- The app uses React Router for client-side routing
- URL changes automatically when you click tabs
- Direct URL navigation works by mapping paths to tab IDs
- Invalid URLs redirect to the default Synthesizer tab

### Browser compatibility
- Works in all modern browsers
- Supports browser back/forward navigation
- URLs can be shared, bookmarked, and opened in new tabs

### For developers
The routing system integrates with the existing `openCity()` function in the HTML, so all existing tab functionality continues to work seamlessly.

## Notes
- The route helper panel only appears in development mode
- In production builds, the helper panel is hidden
- All URLs are case-sensitive
- Invalid routes automatically redirect to the home page
