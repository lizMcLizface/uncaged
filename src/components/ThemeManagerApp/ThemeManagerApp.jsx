import React from 'react';
import styled from 'styled-components';
import { useTheme } from '../../contexts/ThemeContext';
import { GlobalStyles } from '../../styles/globalStyles';
import ThemeSelector from '../ThemeSelector';

const ThemeManagerContainer = styled.div`
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 10000;
    background: ${({ theme }) => theme.background};
    border: 1px solid ${({ theme }) => theme.mid};
    border-radius: 6px;
    padding: 8px;
    box-shadow: 0 2px 8px ${({ theme }) => theme.mid}66;
`;

const ThemeManagerApp = () => {
    const { theme, themes } = useTheme();
    
    return (
        <>
            <GlobalStyles />
            <ThemeManagerContainer>
                <ThemeSelector showLabel={false} />
            </ThemeManagerContainer>
        </>
    );
};

export default ThemeManagerApp;
