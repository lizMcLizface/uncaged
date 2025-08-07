import { createGlobalStyle } from 'styled-components';
import { defaultTransition } from './constants';

const resetStyles = `
    /* http://meyerweb.com/eric/tools/css/reset/
    v2.0 | 20110126
    License: none (public domain)
    */

    html, body, div, span, applet, object, iframe,
    h1, h2, h3, h4, h5, h6, p, blockquote, pre,
    a, abbr, acronym, address, big, cite, code,
    del, dfn, em, img, ins, kbd, q, s, samp,
    small, strike, strong, sub, sup, tt, var,
    b, u, i, center,
    dl, dt, dd, ol, ul, li,
    fieldset, form, label, legend,
    table, caption, tbody, tfoot, thead, tr, th, td,
    article, aside, canvas, details, embed,
    figure, figcaption, footer, header, hgroup,
    menu, nav, output, ruby, section, summary,
    time, mark, audio, video {
        margin: 0;
        padding: 0;
        border: 0;
        font-size: 100%;
        font: inherit;
        vertical-align: middle;
    }
    /* HTML5 display-role reset for older browsers */
    article, aside, details, figcaption, figure,
    footer, header, hgroup, menu, nav, section {
        display: block;
    }
    body {
        line-height: 1;
    }
    ol, ul {
        list-style: none;
    }
    blockquote, q {
        quotes: none;
    }
    blockquote:before, blockquote:after,
    q:before, q:after {
        content: '';
        content: none;
    }
    table {
        border-collapse: collapse;
        border-spacing: 0;
    }
`;

const typographyStyles = `
    font-family: 'Roboto Mono', monospace;;
    font-size: 1rem;
    line-height: 1.2;
    font-weight: 400;
    letter-spacing: 0;
`;

export const GlobalStyles = createGlobalStyle`
    ${resetStyles}

    :root {
        --theme-background: ${({ theme }) => theme.background};
        --theme-lite: ${({ theme }) => theme.lite};
        --theme-mid: ${({ theme }) => theme.mid};
        --theme-strong: ${({ theme }) => theme.strong};
        --theme-pop: ${({ theme }) => theme.pop};
    }

    * {
        box-sizing: border-box;
        transition: ${defaultTransition};
        user-select: none;
    }

    body {
        background-color: ${({ theme }) => theme.background};
        color: ${({ theme }) => theme.strong};
        ${typographyStyles}
    }

    input, button, select, textarea {
        ${typographyStyles}
        outline: none;
        border: none;
    }

    /* Theme existing tab elements */
    .tab {
        background: ${({ theme }) => theme.background} !important;
        color: ${({ theme }) => theme.strong} !important;
        border-color: ${({ theme }) => theme.mid} !important;
        box-shadow: 2px 0 8px ${({ theme }) => theme.mid}55 !important;
    }

    .tab.expanded {
        box-shadow: 2px 0 16px ${({ theme }) => theme.mid}77 !important;
    }

    .tab button.tablinks {
        background-color: ${({ theme }) => theme.background} !important;
        color: ${({ theme }) => theme.strong} !important;
        border: 1px solid ${({ theme }) => theme.mid} !important;
        transition: all 0.3s ease !important;
    }

    .tab button.tablinks:hover {
        background-color: ${({ theme }) => theme.lite} !important;
        border-color: ${({ theme }) => theme.pop} !important;
    }

    .tab button.tablinks.active {
        background-color: ${({ theme }) => theme.pop} !important;
        color: ${({ theme }) => theme.background} !important;
        border-color: ${({ theme }) => theme.pop} !important;
    }

    .tabcontent {
        background-color: ${({ theme }) => theme.background} !important;
        color: ${({ theme }) => theme.strong} !important;
        border-color: ${({ theme }) => theme.mid} !important;
    }

    /* Theme form elements that aren't part of styled components */
    input:not([class*="Knob"]):not([class*="Select"]), 
    select:not([class*="Knob"]):not([class*="Select"]), 
    textarea:not([class*="Knob"]):not([class*="Select"]),
    button:not([class*="Knob"]):not([class*="Select"]):not(.btn) {
        background-color: ${({ theme }) => theme.background};
        color: ${({ theme }) => theme.strong};
        border: 1px solid ${({ theme }) => theme.mid};
        border-radius: 4px;
        padding: 8px 12px;
        
        &:hover {
            border-color: ${({ theme }) => theme.pop};
        }
        
        &:focus {
            border-color: ${({ theme }) => theme.pop};
            box-shadow: 0 0 0 2px ${({ theme }) => theme.pop}33;
        }
    }

    /* Theme Bootstrap buttons with proper colors */
    .btn {
        border-radius: 4px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
        border: 1px solid transparent !important;
        
        &.info {
            background-color: ${({ theme }) => theme.pop} !important;
            color: ${({ theme }) => theme.background} !important;
            border-color: ${({ theme }) => theme.pop} !important;
            
            &:hover {
                background-color: ${({ theme }) => theme.strong} !important;
                border-color: ${({ theme }) => theme.strong} !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px ${({ theme }) => theme.pop}44 !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px ${({ theme }) => theme.pop}44 !important;
            }
        }
        
        &.danger {
            background-color: #dc3545 !important;
            color: white !important;
            border-color: #dc3545 !important;
            
            &:hover {
                background-color: #c82333 !important;
                border-color: #bd2130 !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3) !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px rgba(220, 53, 69, 0.3) !important;
            }
        }
        
        &.warning {
            background-color: #ffc107 !important;
            color: #212529 !important;
            border-color: #ffc107 !important;
            
            &:hover {
                background-color: #e0a800 !important;
                border-color: #d39e00 !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(255, 193, 7, 0.3) !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px rgba(255, 193, 7, 0.3) !important;
            }
        }
        
        &.success {
            background-color: #28a745 !important;
            color: white !important;
            border-color: #28a745 !important;
            
            &:hover {
                background-color: #218838 !important;
                border-color: #1e7e34 !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3) !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3) !important;
            }
        }
        
        &.primary {
            background-color: ${({ theme }) => theme.pop} !important;
            color: ${({ theme }) => theme.background} !important;
            border-color: ${({ theme }) => theme.pop} !important;
            
            &:hover {
                background-color: ${({ theme }) => theme.strong} !important;
                border-color: ${({ theme }) => theme.strong} !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px ${({ theme }) => theme.pop}44 !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px ${({ theme }) => theme.pop}44 !important;
            }
        }
        
        &.secondary {
            background-color: ${({ theme }) => theme.mid} !important;
            color: ${({ theme }) => theme.strong} !important;
            border-color: ${({ theme }) => theme.mid} !important;
            
            &:hover {
                background-color: ${({ theme }) => theme.strong} !important;
                color: ${({ theme }) => theme.background} !important;
                border-color: ${({ theme }) => theme.strong} !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px ${({ theme }) => theme.mid}44 !important;
            }
            
            &:active {
                transform: translateY(0px);
                box-shadow: 0 2px 4px ${({ theme }) => theme.mid}44 !important;
            }
        }
    }
`;
