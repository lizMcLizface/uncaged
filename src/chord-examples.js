// Example usage of precomputed scale chords

// Import the functions from scaleGenerator
import { getPrimaryScaleChords, getAllSelectedScaleChords } from './scaleGenerator.js';

/**
 * Example function to display chords for the current primary scale
 */
function displayPrimaryScaleChords() {
    const chordData = getPrimaryScaleChords();
    
    if (chordData) {
        console.log(`Chords for ${chordData.scaleName} in ${chordData.rootNote}:`);
        console.log('='.repeat(50));
        
        // Display triads and sevenths
        for (let i = 0; i < chordData.triads.length; i++) {
            const triadNames = chordData.triads[i].matches.join(', ');
            const seventhNames = chordData.sevenths[i].matches.join(', ');
            
            console.log(`${intToRoman(i + 1)}: ${triadNames} | ${seventhNames}`);
        }
    } else {
        console.log('No chord data available for primary scale');
    }
}

/**
 * Example function to get chords for a specific degree of the current scale
 * @param {number} degree - Scale degree (1-7)
 * @returns {object|null} Chord information for the specified degree
 */
function getChordsForDegree(degree) {
    const chordData = getPrimaryScaleChords();
    
    if (!chordData || degree < 1 || degree > chordData.triads.length) {
        return null;
    }
    
    const index = degree - 1;
    return {
        degree: degree,
        roman: intToRoman(degree),
        triad: chordData.triads[index],
        seventh: chordData.sevenths[index]
    };
}

/**
 * Example function to get all available chord progressions
 * @returns {Array} Array of chord progression suggestions
 */
function getCommonProgressions() {
    const chordData = getPrimaryScaleChords();
    
    if (!chordData) {
        return [];
    }
    
    // Common progressions in Roman numeral notation
    const progressions = [
        [1, 4, 5, 1],    // I-IV-V-I
        [1, 5, 6, 4],    // I-V-vi-IV
        [6, 4, 1, 5],    // vi-IV-I-V
        [2, 5, 1],       // ii-V-I
        [1, 6, 4, 5],    // I-vi-IV-V
    ];
    
    return progressions.map(progression => {
        return {
            romans: progression.map(degree => intToRoman(degree)),
            chords: progression.map(degree => getChordsForDegree(degree))
        };
    });
}

/**
 * Helper function to convert integers to Roman numerals
 * @param {number} num - Number to convert
 * @returns {string} Roman numeral
 */
function intToRoman(num) {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    return romanNumerals[num - 1] || num.toString();
}

// Example usage:
// displayPrimaryScaleChords();
// console.log(getChordsForDegree(1)); // Get tonic chord
// console.log(getCommonProgressions()); // Get common progressions

export {
    displayPrimaryScaleChords,
    getChordsForDegree,
    getCommonProgressions
};
