import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ImageContextType {
    selectedImage: string | null;
    setSelectedImage: (uri: string | null) => void;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export const ImageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    return (
        <ImageContext.Provider value={{ selectedImage, setSelectedImage }}>
            {children}
        </ImageContext.Provider>
    );
};

export const useImageContext = () => {
    const context = useContext(ImageContext);
    if (context === undefined) {
        throw new Error('useImageContext must be used within an ImageProvider');
    }
    return context;
};
