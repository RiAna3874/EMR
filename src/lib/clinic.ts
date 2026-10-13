// The clinic printed on letterheads, requisitions and prescriptions. Set the
// MERIDIAN_CLINIC_* variables for a real clinic; the defaults are fictional.
export const clinic = {
  name: process.env.MERIDIAN_CLINIC_NAME || "Lakeview Family Medicine",
  address: process.env.MERIDIAN_CLINIC_ADDRESS || "400 Lakeshore Drive, Suite 200, Lakeview, OR 97630",
  phone: process.env.MERIDIAN_CLINIC_PHONE || "(555) 200-1000",
  fax: process.env.MERIDIAN_CLINIC_FAX || "(555) 200-1001",
};
