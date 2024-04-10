// write a test to render the deposit button component

import React from "react";
import { render } from "@testing-library/react";
import DepositButton from "../src/components/v1/DepositButton";

describe("DepositButton", () => {
  it("renders the deposit button component", () => {
    render(
      <DepositButton buttonText="Deposit" popupText="Deposit your funds" />
    );
  });
});
