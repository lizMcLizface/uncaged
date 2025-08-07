import styled from 'styled-components';
import { SPACING, borderRadiusS, borderRadiusM, borderWidthS } from '../../styles/constants';

export const IntervalContainer = styled.div`
    padding: ${SPACING.ml};
    font-family: Arial, sans-serif;
`;

export const IntervalTitle = styled.h2`
    text-align: center;
    margin-bottom: ${SPACING.m};
    color: ${({ theme }) => theme.strong};
    font-size: 20px;
`;

export const IntervalInstructions = styled.p`
    text-align: center;
    margin-bottom: ${SPACING.m};
    color: ${({ theme }) => theme.strong};
    font-size: 14px;
`;

export const IntervalMainContent = styled.div`
    display: grid;
    grid-template-columns: 800px 418px 418px 300px;
    gap: ${SPACING.m};
    align-items: start;
    justify-items: center;
    justify-content: center;
    margin-bottom: ${SPACING.m};
`;

export const IntervalGuideContainer = styled.div`
    background-color: ${({ theme }) => theme.background};
    border: ${borderWidthS} solid ${({ theme }) => theme.strong};
    border-radius: ${borderRadiusM};
    padding: ${SPACING.m};
    font-size: 12px;
    line-height: 1.4;
    color: ${({ theme }) => theme.strong};
    max-height: 600px;
    overflow-y: auto;
    position: sticky;
    top: ${SPACING.m};
`;

export const GuideSection = styled.div`
    margin-bottom: ${SPACING.m};
    
    &:last-child {
        margin-bottom: 0;
    }
`;

export const GuideTitle = styled.h4`
    color: ${({ theme }) => theme.pop};
    margin: 0 0 ${SPACING.s} 0;
    font-size: 13px;
    font-weight: bold;
    border-bottom: 1px solid ${({ theme }) => theme.mid};
    padding-bottom: 2px;
`;

export const GuideText = styled.p`
    margin: 0 0 ${SPACING.xs} 0;
    
    &:last-child {
        margin-bottom: 0;
    }
`;

export const GuideKeyboard = styled.div`
    font-family: 'Courier New', monospace;
    background-color: ${({ theme }) => theme.lite};
    padding: ${SPACING.s};
    border-radius: ${borderRadiusS};
    margin: ${SPACING.xs} 0;
    font-size: 10px;
    line-height: 1.2;
`;

export const GuideList = styled.ul`
    margin: ${SPACING.xs} 0;
    padding-left: ${SPACING.m};
    
    li {
        margin-bottom: 2px;
    }
`;

export const GuideCode = styled.code`
    background-color: ${({ theme }) => theme.lite};
    padding: 1px 4px;
    border-radius: 2px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
`;

export const IntervalGridContainer = styled.div`
    display: grid;
    grid-template-columns: 60px repeat(12, 50px);
    grid-template-rows: 30px repeat(12, 30px);
    gap: 2px;
    max-width: 800px;
    background-color: ${({ theme }) => theme.lite};
    padding: ${SPACING.s};
    border-radius: ${borderRadiusM};
    border: ${borderWidthS} solid ${({ theme }) => theme.mid};
`;

export const IntervalHeaderCell = styled.div.withConfig({
    shouldForwardProp: (prop) => !['clickable'].includes(prop),
})`
    background-color: ${({ theme }) => theme.lite};
    border: 1px solid ${({ theme }) => theme.mid};
    border-radius: ${borderRadiusS};
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 11px;
    text-align: center;
    color: ${({ theme }) => theme.strong};
    ${({ clickable, theme }) => clickable && `
        cursor: pointer;
        transition: background-color 0.2s ease;
        
        &:hover {
            background-color: ${theme.mid};
        }
    `}
`;

export const IntervalCell = styled.div.withConfig({
    shouldForwardProp: (prop) => !['selected'].includes(prop),
})`
    background-color: ${({ selected, theme }) => selected ? '#4caf50' : theme.background};
    border: 2px solid ${({ selected, theme }) => selected ? '#388e3c' : theme.mid};
    border-radius: ${borderRadiusS};
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: ${({ selected, theme }) => selected ? '#ffffff' : theme.strong};
    
    &:hover {
        background-color: ${({ selected, theme }) => 
            selected ? '#4caf50' : theme.lite};
    }
`;

export const IntervalGuessButton = styled.button.withConfig({
    shouldForwardProp: (prop) => !['state'].includes(prop),
})`
    width: 45px;
    height: 45px;
    border: 3px solid ${({ state, theme }) => {
        switch(state) {
            case 1: return '#4caf50'; // Green
            case 2: return '#2196f3'; // Blue  
            default: return theme.mid;
        }
    }} !important;
    border-radius: 50% !important;
    background-color: ${({ state, theme }) => {
        switch(state) {
            case 1: return '#81c784'; // Light green
            case 2: return '#64b5f6'; // Light blue
            default: return theme.mid;
        }
    }} !important;
    color: ${({ state, theme }) => {
        switch(state) {
            case 1: return '#ffffffff'; // White text on green
            case 2: return '#ffffff'; // White text on blue
            default: return theme.strong;
        }
    }} !important;
    font-weight: bold;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s ease !important;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 !important;
    box-shadow: ${({ state, theme }) => {
        switch(state) {
            case 1: return `0 0 8px rgba(76, 175, 80, 0.5)`;
            case 2: return `0 0 12px rgba(33, 150, 243, 0.5)`;
            default: return 'none';
        }
    }};
    
    &:hover {
        transform: scale(1.05);
        box-shadow: ${({ state, theme }) => {
            switch(state) {
                case 1: return `0 0 12px rgba(76, 175, 79, 1)`;
                case 2: return `0 0 16px rgba(33, 150, 243, 0.8)`;
                default: return `0 0 6px rgba(200, 200, 200, 1)`;
            }
        }};
    }
`;

export const IntervalControlsContainer = styled.div`
    display: flex;
    justify-content: center;
    gap: ${SPACING.s};
    margin-bottom: ${SPACING.m};
    flex-wrap: wrap;
`;

export const ActionButton = styled.button.withConfig({
    shouldForwardProp: (prop) => !['primary'].includes(prop),
})`
    padding: ${SPACING.s} ${SPACING.m};
    background-color: ${({ primary, theme }) => primary ? '#4caf50' : theme.pop};
    color: ${({ theme }) => theme.background};
    border: none;
    border-radius: ${borderRadiusS};
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: background-color 0.2s ease;
    
    &:hover {
        background-color: ${({ primary, theme }) => 
            primary ? '#388e3c' : theme.strong};
    }
`;

export const GuessSection = styled.div`
    margin-bottom: ${SPACING.m};
`;

export const GuessButtonsContainer = styled.div`
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: ${SPACING.s};
    margin-bottom: ${SPACING.m};
`;

export const GuessActionsContainer = styled.div`
    display: flex;
    justify-content: center;
    gap: ${SPACING.m};
    margin-bottom: ${SPACING.s};
`;

export const GuessDisplay = styled.div`
    text-align: center;
    padding: ${SPACING.s};
    background-color: ${({ theme }) => theme.lite};
    border-radius: ${borderRadiusS};
    font-size: 12px;
    color: ${({ theme }) => theme.strong};
    min-height: 20px;
    border: 1px solid ${({ theme }) => theme.mid};
`;

export const SelectedDisplay = styled.div`
    padding: ${SPACING.s};
    background-color: ${({ theme }) => theme.lite};
    border-radius: ${borderRadiusS};
    min-height: 40px;
    font-size: 12px;
    color: ${({ theme }) => theme.strong};
    border: 1px solid ${({ theme }) => theme.mid};
`;

export const StatusDisplay = styled.div.withConfig({
    shouldForwardProp: (prop) => !['status', 'visible'].includes(prop),
})`
    padding: ${SPACING.s};
    background-color: ${({ status, theme }) => {
        switch(status) {
            case 'success': return 'rgba(76, 175, 80, 0.1)';
            case 'error': return 'rgba(244, 67, 54, 0.1)';
            case 'info': return 'rgba(33, 150, 243, 0.05)';
            default: return theme.lite;
        }
    }};
    border: 1px solid ${({ status, theme }) => {
        switch(status) {
            case 'success': return 'rgba(76, 175, 80, 0.3)';
            case 'error': return 'rgba(244, 67, 54, 0.3)';
            case 'info': return 'rgba(33, 150, 243, 0.2)';
            default: return theme.mid;
        }
    }};
    border-radius: ${borderRadiusS};
    min-height: 40px;
    font-size: 12px;
    color: ${({ status, theme }) => {
        switch(status) {
            case 'success': return 'rgba(46, 125, 50, 0.9)';
            case 'error': return 'rgba(198, 40, 40, 0.9)';
            case 'info': return 'rgba(25, 118, 210, 0.8)';
            default: return theme.strong;
        }
    }};
    margin-top: ${SPACING.s};
    transition: all 0.3s ease;
    opacity: ${({ visible }) => visible ? 1 : 0};
    transform: translateY(${({ visible }) => visible ? '0' : '-10px'});
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: ${({ status }) => status === 'info' ? 'normal' : 'bold'};
`;
