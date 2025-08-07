import styled from 'styled-components';
import { relaInline, absCenter } from '../../styles/util';
import { SPACING, borderWidthS, borderRadiusM } from '../../styles/constants';

export const ComponentContainer = styled.div`
    ${relaInline}
    height: 100%;
    width: 100%;
    padding: ${SPACING.m};
    padding-top: calc(${SPACING.m} + ${SPACING.s}); /* Extra top padding for label space */
    border: ${borderWidthS} solid ${({ theme }) => theme.strong};
    border-radius: ${borderRadiusM};
    background-color: ${({ theme }) => theme.background};
`;

export const Label = styled.h4`
    position: absolute;
    top: -0.5em; /* Position label outside the border */
    left: 50%;
    transform: translateX(-50%);
    width: fit-content;
    color: ${({ theme }) => theme.pop};
    padding: 0 ${SPACING.s};
    background-color: ${({theme}) => theme.background};
    letter-spacing: 0.5px;
    font-size: 1.25rem; /* Slightly smaller font to reduce space usage */
    margin: 0; /* Remove default margins */
    white-space: nowrap; /* Prevent label text wrapping */
`;

export const Bolt = styled.div`
    position: absolute;
    height: 0.375rem;
    width: 0.375rem;
    border: ${borderWidthS} solid ${({ theme }) => theme.strong};
    border-radius: 100%;

    &:nth-child(1) {
        top: ${SPACING.s};
        left: ${SPACING.s};
    }
    &:nth-child(2) {
        top: ${SPACING.s};
        right: ${SPACING.s};
    }
    &:nth-child(3) {
        bottom: ${SPACING.s};
        left: ${SPACING.s};
    }
    &:nth-child(4) {
        bottom: ${SPACING.s};
        right: ${SPACING.s};
    }
`;
