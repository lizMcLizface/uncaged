import styled from 'styled-components';

export const ComponentContainer = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, rgba(5, 5, 15, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%);
    border: 1px solid rgba(100, 100, 150, 0.3);
    border-radius: 4px;
    overflow: hidden;
`;

export const Label = styled.div`
    position: absolute;
    top: 4px;
    left: 8px;
    color: #00ff88;
    font-size: 11px;
    font-weight: bold;
    z-index: 10;
    text-shadow: 0 0 4px rgba(0, 255, 136, 0.5);
`;

export const Canvas = styled.canvas`
    width: 100%;
    height: 100%;
    display: block;
`;

export const FrequencyLabels = styled.div`
    position: absolute;
    left: 4px;
    top: 20px;
    bottom: 20px;
    width: 50px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: rgba(200, 200, 200, 0.7);
    font-size: 10px;
    line-height: 1;
    z-index: 10;
    pointer-events: none;
`;

export const AmplitudeLabels = styled.div`
    position: absolute;
    bottom: 4px;
    left: 55px;
    right: 4px;
    height: 15px;
    display: flex;
    justify-content: space-between;
    color: rgba(200, 200, 200, 0.7);
    font-size: 10px;
    line-height: 1;
    z-index: 10;
    pointer-events: none;
`;
