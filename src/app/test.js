import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';


export default function Test() {


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>
    Say Home to return home
      </Text>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  transcript: { fontSize: 16, lineHeight: 22 },
});

