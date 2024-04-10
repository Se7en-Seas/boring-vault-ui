// webpack.config.js
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

module.exports = {
  entry: "./src/examples/v1.tsx", // Entry point for your React app
  output: {
    path: path.resolve(__dirname, "dist"), // Output directory
    filename: "v1.js", // Output file
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/examples/v1.html", // Path to your HTML template
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"], // Resolve these extensions
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, "public"), // Directory to serve static files from
    },
    compress: true,
    port: 9000, // Port to run the dev server
  },
  stats: {
    errorDetails: true, // Display the details of errors
    children: true, // Display information about child compilations
  },
};