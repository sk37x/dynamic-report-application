"use client";

import { Button, createTheme, PasswordInput, Select, TextInput } from '@mantine/core';

const appFontFamily = "var(--font-noto-sans), Tahoma, Arial, sans-serif";

export const theme = createTheme({
    primaryColor: 'brand',
    primaryShade: {
        light: 6,
        dark: 4,
    },

    colors: {
        brand: [
            "#eff6ff",
            "#dbeafe",
            "#bfdbfe",
            "#93c5fd",
            "#60a5fa",
            "#3b82f6",
            "#2563eb",
            "#1d4ed8",
            "#1e40af",
            "#1e3a8a",
        ],
    },

    fontFamily: appFontFamily,
    fontFamilyMonospace: appFontFamily,

    headings: {
        fontFamily: appFontFamily,
        fontWeight: "600",
    },

    defaultRadius: 'md',

    components: {
        Button: Button.extend({
            defaultProps: {
                size: 'sm',
            },
        }),

        TextInput: TextInput.extend({
            defaultProps: {
                size: 'sm',
            },
        }),

        PasswordInput: PasswordInput.extend({
            defaultProps: {
                size: 'sm',
            },
        }),

        Select: Select.extend({
            defaultProps: {
                size: 'sm',
            },
        })
    }
})