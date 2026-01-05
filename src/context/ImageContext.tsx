
import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ImageFile } from '../types';

interface ImageContextType {
    capturedImage: ImageFile | null;
    setCapturedImage: (image: ImageFile | null) => void;
    clearCapturedImage: () => void;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: ReactNode }) {
    const [capturedImage, setCapturedImage] = useState<ImageFile | null>(null);

    const clearCapturedImage = () => setCapturedImage(null);

    return (
        <ImageContext.Provider value={{ capturedImage, setCapturedImage, clearCapturedImage }}>
            {children}
        </ImageContext.Provider>
    );
}

export function useImageContext() {
    const context = useContext(ImageContext);
    if (context === undefined) {
        throw new Error('useImageContext must be used within an ImageProvider');
    }
    return context;
}
