import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../../src/services/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignUp = async () => {
        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert('Sign Up Error', error.message);
        } else {
            Alert.alert('Success', 'Check your email for the confirmation link!');
            router.replace('/auth/sign-in');
        }
        setLoading(false);
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0D1117] justify-center px-6">
            <View className="items-center mb-8">
                <Text className="text-2xl font-black text-white italic tracking-tighter">
                    CREATE ACCOUNT
                </Text>
            </View>

            <View className="space-y-4">
                <View>
                    <Text className="text-zinc-400 text-xs uppercase font-bold mb-2 ml-1">Email</Text>
                    <TextInput
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white"
                        placeholder="paintmaster@example.com"
                        placeholderTextColor="#52525b"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                    />
                </View>

                <View className="mt-4">
                    <Text className="text-zinc-400 text-xs uppercase font-bold mb-2 ml-1">Password</Text>
                    <TextInput
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white"
                        placeholder="••••••••"
                        placeholderTextColor="#52525b"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <View className="mt-4">
                    <Text className="text-zinc-400 text-xs uppercase font-bold mb-2 ml-1">Confirm Password</Text>
                    <TextInput
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white"
                        placeholder="••••••••"
                        placeholderTextColor="#52525b"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={loading}
                    className={`w-full py-4 rounded-xl mt-6 items-center ${loading ? 'bg-indigo-800' : 'bg-indigo-600'}`}
                >
                    <Text className="text-white font-bold uppercase tracking-widest text-sm">
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </Text>
                </TouchableOpacity>

                <View className="flex-row justify-center mt-8">
                    <Text className="text-zinc-500 text-sm">Already have an account? </Text>
                    <Link href="/auth/sign-in" asChild>
                        <TouchableOpacity>
                            <Text className="text-indigo-400 text-sm font-bold">Sign In</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </SafeAreaView>
    );
}
