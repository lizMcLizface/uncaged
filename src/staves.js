// staves.js - Functions for managing musical notation and grid data
// This module provides functions to add, clear, and manage musical notation displays
// and maintains a global gridData variable accessible from other JS files

// Import required functions from other modules
// Note: These imports depend on the functions being available in the global scope or as ES6 modules

/**
 * Global grid data variable - stores the structured note data for playback and highlighting
 * This is accessible from other JS files as window.gridData
 * Format: Array of bar objects, each containing barIndex, totalBeats, and notes array
 */
window.gridData = window.gridData || [];

/**
 * Add new bars to the existing notation and update grid data
 * @param {HTMLElement} div - The DOM element where notation is displayed
 * @param {Array} newNoteArray - Array in format [[trebleNotes], [bassNotes]] same as outputNoteArray
 * @param {boolean} updatePlaybackIfNeeded - Whether to handle playback updates (default: true)
 */
function addDrawNotes(div, newNoteArray, updatePlaybackIfNeeded = true) {
    // console.log('Adding new bars to existing notation:', newNoteArray);
    
    // newNoteArray format: [[trebleNotes], [bassNotes]] - same as outputNoteArray
    if (!newNoteArray || newNoteArray.length < 2) {
        console.log('Invalid newNoteArray format for addDrawNotes');
        return;
    }

    // Append new bars to the existing outputNoteArray
    const newTrebleBars = newNoteArray[0];
    const newBassBars = newNoteArray[1];
    
    // Extend the existing outputNoteArray
    if (typeof window.outputNoteArray !== 'undefined') {
        window.outputNoteArray[0] = window.outputNoteArray[0].concat(newTrebleBars);
        window.outputNoteArray[1] = window.outputNoteArray[1].concat(newBassBars);
        
        // Redraw all notation with the updated data
        if (typeof window.drawNotes2 === 'function') {
            window.gridData = window.drawNotes2(div, window.outputNoteArray, false);
        } else {
            console.error('drawNotes2 function not available on window');
            return;
        }
    } else {
        console.error('outputNoteArray not available on window');
        return;
    }
    
    // console.log('Updated grid data after adding bars:', window.gridData);
    
    // Update any ongoing playback to recognize the new bars
    if (updatePlaybackIfNeeded && typeof window.isPlaying !== 'undefined' && window.isPlaying) {
        // If currently playing, the playback system will automatically handle the extended gridData
        // console.log('Playback system will recognize new bars on next iteration');
    }
}

/**
 * Convenience function to add just one bar at a time
 * @param {HTMLElement} div - The DOM element where notation is displayed
 * @param {Array} trebleBarNotes - Array of note objects for treble staff
 * @param {Array} bassBarNotes - Array of note objects for bass staff
 * @param {boolean} updatePlaybackIfNeeded - Whether to handle playback updates (default: true)
 */
function addSingleBar(div, trebleBarNotes, bassBarNotes, updatePlaybackIfNeeded = true) {
    // trebleBarNotes and bassBarNotes format: [{"note": "C/4", "duration": "4"}, ...]
    const singleBarArray = [
        [trebleBarNotes || []], // Wrap in array to represent one bar
        [bassBarNotes || []]    // Wrap in array to represent one bar
    ];
    
    addDrawNotes(div, singleBarArray, updatePlaybackIfNeeded);
}

/**
 * Clear all notation and reset to empty state
 * @param {HTMLElement} div - The DOM element to clear
 */
function clearAllNotation(div) {
    // Reset to empty state
    if (typeof window.outputNoteArray !== 'undefined') {
        window.outputNoteArray[0] = [];
        window.outputNoteArray[1] = [];
    }
    window.gridData = [];
    
    // Clear the visual display
    while (div.hasChildNodes()) {
        div.removeChild(div.lastChild);
    }
    
    // Reset playback position
    if (typeof window.resetPlaybackPosition === 'function') {
        window.resetPlaybackPosition();
    }
    
    console.log('All notation cleared');
}

/**
 * Remove the last bar from the existing notation and update grid data
 * @param {HTMLElement} div - The DOM element where notation is displayed
 * @param {boolean} updatePlaybackIfNeeded - Whether to handle playback updates (default: true)
 */
function removeLastBar(div, updatePlaybackIfNeeded = true) {
    console.log('Removing last bar from notation');
    
    // Check if there are bars to remove
    if (typeof window.outputNoteArray === 'undefined') {
        console.error('outputNoteArray not available on window');
        return;
    }
    
    const trebleBars = window.outputNoteArray[0];
    const bassBars = window.outputNoteArray[1];
    
    if (trebleBars.length === 0 && bassBars.length === 0) {
        console.log('No bars to remove - notation is already empty');
        return;
    }
    
    // Remove the last bar from both treble and bass
    if (trebleBars.length > 0) {
        const removedTrebleBar = trebleBars.pop();
        // console.log('Removed treble bar:', removedTrebleBar);
    }
    
    if (bassBars.length > 0) {
        const removedBassBar = bassBars.pop();
        // console.log('Removed bass bar:', removedBassBar);
    }
    
    // Redraw all notation with the updated data
    if (typeof window.drawNotes2 === 'function') {
        window.gridData = window.drawNotes2(div, window.outputNoteArray, false);
    } else {
        console.error('drawNotes2 function not available on window');
        return;
    }
    
    // console.log('Updated grid data after removing last bar:', window.gridData);
    
    // Update playback position if it's beyond the new bounds
    if (updatePlaybackIfNeeded) {
        // Check if current playback position is now out of bounds
        if (typeof window.currentBarIndex !== 'undefined' && 
            typeof window.currentNoteIndex !== 'undefined' && 
            window.gridData.length > 0) {
            
            if (window.currentBarIndex >= window.gridData.length) {
                // Reset to last bar if current position is beyond bounds
                window.currentBarIndex = Math.max(0, window.gridData.length - 1);
                window.currentNoteIndex = 0;
                // console.log('Adjusted playback position to bounds:', window.currentBarIndex, window.currentNoteIndex);
            }
        }
        
        if (typeof window.isPlaying !== 'undefined' && window.isPlaying) {
            // console.log('Playback system will recognize updated bars on next iteration');
        }
    }
}

// Make functions available globally for script tags and other modules
window.addDrawNotes = addDrawNotes;
window.addSingleBar = addSingleBar;
window.clearAllNotation = clearAllNotation;
window.removeLastBar = removeLastBar;

// ES6 export for modern module systems
export { addDrawNotes, addSingleBar, clearAllNotation, removeLastBar };
