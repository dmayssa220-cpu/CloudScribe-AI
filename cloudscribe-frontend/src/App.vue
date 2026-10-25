<script setup lang="ts"></script>

<template>
  <nav>
    <router-link to="/">Accueil</router-link> | 
    <router-link to="/pricing">Tarifs</router-link>
  </nav>
  <router-view />
</template>

<style>
nav { padding: 20px; background: #333; text-align: center; }
nav a { color: white; text-decoration: none; margin: 0 10px; font-size: 18px; }
nav a.router-link-active { font-weight: bold; color: #42b883; }
</style>

<style scoped></style>
