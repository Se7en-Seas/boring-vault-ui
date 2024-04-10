// src/examples/v1.tsx
import React from "react";
import ReactDOM from "react-dom";
import { ChakraProvider, Flex } from "@chakra-ui/react";
import DepositButton from "../components/v1/DepositButton";
import { createRoot } from "react-dom/client";

const App = () => (
  <ChakraProvider>
    <Flex justifyContent="center" alignItems="center" height="100vh">
      <DepositButton
        buttonText="Deposit"
        popupText="This is your deposit modal!"
        buttonStyle={{
          backgroundColor: "lightblue",
          color: "black",
          fontWeight: "bold",
        }} // Button styles
        modalStyles={{
          backgroundColor: "white",
          color: "darkGrey",
          fontWeight: "bold",
          border: "2px solid black",
          borderRadius: "10px", 
          padding: "10px",
          // center on the middle of the screen with the middle of the modal
          position: "fixed",
          top: "40%",
          left: "40%",
        }}

        // Modal styles
      />
    </Flex>
  </ChakraProvider>
);

const element = document.getElementById("root");
const root = createRoot(element!);
root.render(<App />);
