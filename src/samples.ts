import type { Lang } from "./analyzer";

export const SAMPLES: Partial<Record<Lang, string>> = {
  js: `import { fetchJson } from "./api";

const config = { retries: 3 };

function buildUrl(path) {
  return "/api/" + path;
}

async function loadUser(id) {
  const url = buildUrl("users/" + id);
  return fetchJson(url, config);
}

function formatName(user) {
  return user.first + " " + user.last;
}

async function renderProfile(id) {
  const user = await loadUser(id);
  return render(formatName(user));
}

class Store {
  save(user) { return persist(user, config); }
  load(id) { return loadUser(id); }
}
`,
  react: `import { useState } from "react";

function api(path) {
  return fetch("/api/" + path).then(r => r.json());
}

export default function Counter() {
  const [count, setCount] = useState(0);
  const [user, setUser] = useState(null);

  function increment() { setCount(count + 1); }

  async function load() {
    const u = await api("me");
    setUser(u);
  }

  return null;
}
`,
  vue: `<template>
  <button @click="increment">{{ count }}</button>
</template>

<script setup>
import { ref, computed } from "vue";

const count = ref(0);
const double = computed(() => count.value * 2);

function increment() {
  count.value++;
  log(count.value);
}

function log(v) {
  console.log(v);
}
</script>
`,
  python: `import math

PI = 3.14159

def area(r):
    return PI * square(r)

def square(x):
    return x * x

class Circle:
    def __init__(self, r):
        self.r = r

    def size(self):
        return area(self.r)

    def grow(self, f):
        self.r = scale(self.r, f)

def scale(value, factor):
    return value * factor
`,
  java: `import java.util.List;

public class Account {
    private double balance;

    public void deposit(double amount) {
        balance = add(balance, amount);
        log(balance);
    }

    public double add(double a, double b) {
        return a + b;
    }

    private void log(double v) {
        System.out.println(v);
    }
}
`,
  cpp: `#include <iostream>

int square(int x) {
    return x * x;
}

int sumOfSquares(int a, int b) {
    return square(a) + square(b);
}

int main() {
    int r = sumOfSquares(3, 4);
    std::cout << r;
    return 0;
}
`,
  arduino: `int ledPin = 13;
int counter = 0;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void blink(int ms) {
  digitalWrite(ledPin, HIGH);
  delay(ms);
  digitalWrite(ledPin, LOW);
}

void loop() {
  blink(500);
  counter = increment(counter);
  Serial.println(counter);
}

int increment(int v) {
  return v + 1;
}
`,
  csharp: `using System;

class Calculator {
    private int total;

    public void Add(int value) {
        total = Sum(total, value);
        Print(total);
    }

    public int Sum(int a, int b) {
        return a + b;
    }

    private void Print(int v) {
        Console.WriteLine(v);
    }
}
`,
  dart: `import 'package:flutter/material.dart';

int base = 10;

int square(int x) => x * x;

int compute(int n) {
  return square(n) + base;
}

class Counter extends StatelessWidget {
  int value = 0;

  void increment() {
    value = compute(value);
  }
}

void main() {
  runApp(Counter());
}
`,
  web: `<!doctype html>
<html>
  <head>
    <style>
      #app { color: black; }
      #title { font-weight: bold; }
    </style>
  </head>
  <body>
    <div id="app">
      <h1 id="title">Hello</h1>
      <button id="btn" onclick="increment()">+</button>
    </div>

    <script>
      let count = 0;

      function increment() {
        count = add(count, 1);
        render(count);
      }

      function add(a, b) { return a + b; }

      function render(v) {
        document.getElementById("title").textContent = v;
      }
    </script>
  </body>
</html>
`,
};
