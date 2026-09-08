"use client";

import type { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { theme } from '../theme/theme';
import { AuthProvider } from '@/features/auth/auth-provider';

type AppProvidersProps = {
    children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
    return (
        <MantineProvider theme={theme} defaultColorScheme="auto">
            <Notifications position='bottom-right' />
            <AuthProvider>
                {children}
            </AuthProvider>
        </MantineProvider>
    );
}