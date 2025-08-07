import styled from 'styled-components';
import { SPACING, borderRadiusM } from '../../styles/constants';
import { relaBlock } from '../../styles/util';

export const ComponentContainer = styled.div`
    ${relaBlock}
    width: 100%;
    height: 8rem;
    background-color: ${({ theme }) => theme.backgroundStrong};
    border: 2px solid ${({ theme }) => theme.strong};
    border-radius: ${borderRadiusM};
    overflow: hidden;
`;

export const Canvas = styled.canvas`
    width: 100%;
    height: 100%;
    display: block;
    background-color: ${({ theme }) => theme.backgroundStrong};
`;

export const Label = styled.div`
    position: absolute;
    top: ${SPACING.xs};
    left: ${SPACING.xs};
    font-size: 0.7rem;
    color: ${({ theme }) => theme.textMuted};
    pointer-events: none;
    z-index: 1;
`;

export const FrequencyLabels = styled.div`
    position: absolute;
    right: ${SPACING.xs};
    top: ${SPACING.xs};
    font-size: 0.6rem;
    color: ${({ theme }) => theme.textMuted};
    pointer-events: none;
    z-index: 1;
    text-align: right;
    line-height: 1.2;
`;
