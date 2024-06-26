// webpack.config.js
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

/* Uncomment for arbitrum example with direct withdraws */
/*
module.exports = {
  entry: "./src/examples/v2.tsx", // Entry point for your React app
  output: {
    path: path.resolve(__dirname, "dist"), // Output directory
    filename: "v2.js", // Output file
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/examples/v2.html", // Path to your HTML template
    }),
    new webpack.DefinePlugin({
      "process.env": JSON.stringify(process.env), // Defines it on process.env
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"], // Resolve these extensions
  },
  devServer: {
    static: path.resolve(__dirname, "dist"), // Serve files from 'dist' directory
    compress: true,
    port: 9000, // Port to run the dev server
  },
  stats: {
    errorDetails: true, // Display the details of errors
    children: true, // Display information about child compilations
  },
};
*/

/* Uncomment for ethereum example with withdraw queue */

module.exports = {
  entry: "./src/examples/v1.tsx", // Entry point for your React app
  output: {
    path: path.resolve(__dirname, "dist"), // Output directory
    filename: "v1.js", // Output file
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/examples/v1.html", // Path to your HTML template
    }),
    new webpack.DefinePlugin({
      "process.env": JSON.stringify(process.env), // Defines it on process.env
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"], // Resolve these extensions
  },
  devServer: {
    static: path.resolve(__dirname, "dist"), // Serve files from 'dist' directory
    compress: true,
    port: 9000, // Port to run the dev server
  },
  stats: {
    errorDetails: true, // Display the details of errors
    children: true, // Display information about child compilations
  },
};
