import styled from 'styled-components';
import { SPACING, borderWidthM, defaultTransition } from '../../styles/constants';
import {
    relaBlock,
    relaInline,
    absCenter,
    vertCenter,
    absFill,
} from '../../styles/util';


export const Label = styled.h2.withConfig({
    shouldForwardProp: (prop) => prop !== 'disabled',
})`
    ${relaBlock}
    max-width: 5rem;
    margin: -${SPACING.s} auto ${SPACING.s};
    text-align: center;
    font-size: 13px;

    & > * {
        color: ${({ theme, disabled }) => disabled ? theme.mid : theme.strong};
    }

    & > .value-text {
        ${absFill}
        opacity: 0;
    }
`;

export const ComponentContainer = styled.div.withConfig({
    shouldForwardProp: (prop) => prop !== 'disabled',
})`
    ${relaInline}
    margin: 0 ${SPACING.s};
    vertical-align: top;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'default'};

    &:hover ${Label}, &:active ${Label} {
        & .label-text {
            opacity: 0;
        }
        & .value-text {
            opacity: 1;
        }
    }
`;

export const KnobContainer = styled.div.withConfig({
    shouldForwardProp: (prop) => prop !== 'disabled',
})`
    ${relaInline}
    height: 5rem;
    width: 5rem;
    pointer-events: ${({ disabled }) => disabled ? 'none' : 'all'};
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'ns-resize'};
    user-select: none; /* Prevent text selection */
    touch-action: none; /* Improve touch interaction */
`;

export const KnobSvg = styled.svg`
    ${absFill}
    & path {
        fill: none;
        stroke-linecap: round;
        stroke-width: 3;
        will-change: stroke-dashoffset;
        transition: 0.3s cubic-bezier(0, 0, 0.24, 1);
    }
`;

export const BackgroundMeter = styled.path`
    stroke: ${({ theme }) => theme.lite};
`;

export const ActiveMeter = styled.path.withConfig({
    shouldForwardProp: (prop) => prop !== 'disabled',
})`
    stroke: ${({ theme, disabled }) => disabled ? theme.mid : theme.strong};
    transition: stroke 0.2s ease;
    
    ${KnobContainer}:hover & {
        stroke: ${({ theme, disabled }) => disabled ? theme.mid : theme.pop};
    }
`;

export const KnobDial = styled.div.withConfig({
    shouldForwardProp: (prop) => prop !== 'disabled',
})`
    ${absCenter}
    height: 3rem;
    width: 3rem;
    border: ${borderWidthM} solid ${({ theme, disabled }) => disabled ? theme.mid : theme.strong};
    border-radius: 100%;
    text-align: center;
    transition: 0s, border ${defaultTransition}, transform 0.1s ease;

    &::after {
        content: "";
        position: absolute;
        height: 0.75rem;
        width: ${borderWidthM};
        background-color: ${({ theme, disabled }) => disabled ? theme.mid : theme.strong};
        transition: ${defaultTransition};
    }
    
    ${KnobContainer}:hover & {
        border-color: ${({ theme, disabled }) => disabled ? theme.mid : theme.accent};
    }
    
    ${KnobContainer}:active & {
        transform: translate(-50%,-50%) scale(0.98);
    }
`;
