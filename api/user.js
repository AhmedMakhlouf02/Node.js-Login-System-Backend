const express = require("express");
const router = express.Router();
const User = require("./../models/User");
const UserVerification = require("./../models/UserVerification");
const PasswordReset = require("./../models/PasswordReset");
// Email handler
const nodemailer = require("nodemailer");

// Password handler
const bcrypt = require("bcrypt");

// Unique string
const { v4: uuidv4 } = require("uuid");

// path for static verified page
const path = require("path");
const { log } = require("console");

require("dotenv").config();

// nodemailer transporter stuff
let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.AUTH_PASS,
  },
});

// testing success
transporter.verify((error, success) => {
  if (error) {
    console.log(error);
  } else {
    console.log("Ready for messages");
    console.log(success);
  }
});

// Signup
router.post("/signup", (req, res) => {
  let { name, email, password } = req.body;
  name = name.trim();
  email = email.trim();
  password = password.trim();

  if (name == "" || email == "" || password == "") {
    res.status(404).json({ message: "Empty Input Fields!" });
  } else if (!/^[a-zA-Z]*$/.test(name)) {
    res.status(404).json({ message: "Invalid name entered" });
  } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    res.status(404).json({ message: "Invalid email entered" });
  } else if (password.length < 8) {
    res.status(404).json({ message: " Password is too short" });
  } else {
    // Checking if usr already exists
    User.find({ email })
      .then((result) => {
        if (result.length) {
          // A user already exists
          res
            .status(400)
            .json({ message: "User with the provided email already exists" });
        } else {
          // Create New User
          const saltRounds = 10;
          bcrypt
            .hash(password, saltRounds)
            .then((hashedPassword) => {
              const newUser = new User({
                name,
                email,
                password: hashedPassword,
                verified: false,
              });
              
              newUser
                .save()
                .then((result) => {
                  // handle account vrification  sendVerifictionEmail(result, res)
                  sendVerifictionEmail(result, res);
                })
                .catch((error) => {
                  res.status(500).json({
                    message: "An Error occurred while saving user account",
                    error,
                  });
                });
            })
            .catch((error) => {
              console.log(error)
              res.status(500).json({
                message: "An error occured while hashing password",
                error,
              });
            });
        }
      })
      .catch((error) => {
        console.log(error);
        res.status(404).json({
          message: "An error occurred while checking for existing user ",
        });
      });
  }
});

// send Verifiction to Email function(result, res)
const sendVerifictionEmail = ({ _id, email }, res) => {
  // url to be used in the email
  const currentUrl = "http://localhost:5000/";
  const uniqueString = uuidv4() + _id;

  // mail options
  const mailOptions = {
    from: process.env.AUTH_EMAIL,
    to: email,
    subject: "Verify Your Email",
    html: `<p>Verify your email address to complete the signup and login into your account.</p><p>This link <b>expires in 6 hours</b></p><p>Press <a href=${
      currentUrl + "user/verify/" + _id + "/" + uniqueString
    }>here</a> to proceed</p>`,
  };

  // hash the uniqueString
  const saltRounds = 10;
  bcrypt
    .hash(uniqueString, saltRounds)
    .then((hashUniqueString) => {
      // set values in UserVerification collection
      const newVerification = new UserVerification({
        userId: _id,
        uniqueString: hashUniqueString,
        createdAt: Date.now(),
        expiresAt: Date.now() + 21600000,
      });
      newVerification
        .save()
        .then(() => {
          transporter
            .sendMail(mailOptions)
            .then(() => {
              // email send & verification record saved
              res.json({
                status: "PENDING",
                message: "Verification email sent",
              });
            })
            .catch((error) => {
              console.log(error);
              res.json({
                status: "FAILED",
                message: "Verification email failed",
              });
            });
        })
        .catch((error) => {
          console.log(error);
          res
            .status(500)
            .json({ message: "Couldn't save newUserVerification email" });
        });
    })
    .catch(() => {
      res
        .status(500)
        .json({ message: "An error occured while hashing email data" });
    });
};

// verify email
router.get("/verify/:userId/:uniqueString", (req, res) => {
  const { userId, uniqueString } = req.params;

  UserVerification.find({ userId })
    .then((result) => {
      if (result.length > 0) {
        // user verification record exists so we proceed
        const { expiresAt } = result[0];
        const hashedUniqueString = result[0].uniqueString;

        // checking for expired unique string
        if (expiresAt < Date.now()) {
          // record has expired so we delete it
          UserVerification.deleteOne({ expiresAt })
            .then((result) => {
              User.deleteOne({ _id: userId })
                .then(() => {
                  let message = "Link has expired. Please sign up again";
                  res.redirect(`user/verified/error=true&message=${message}`);
                })
                .catch((error) => {
                  console.log(error);
                  let message = "Clearing user with expired unique string failed";
                  res.redirect(`user/verified/error=true&message=${message}`);
                });
            })
            .catch((error) => {
              console.log(error);
              let message =
                "An error occured while clearing expired user verification record";
              res.redirect(`user/verified/error=true&message=${message}`);
            });
        } else {
          // valid record exists so we validate the user string
          // first compare th hashed unique string

          bcrypt
            .compare(uniqueString, hashedUniqueString)
            .then((result) => {
              if (result) {
                // strings match
                User.updateOne({ _id: userId }, { verified: true })
                  .then(() => {
                    UserVerification.deleteOne({ userId })
                      .then(() => {
                        res.sendFile(
                          path.join(__dirname, "./../views/verified.html")
                        );
                      })
                      .catch((error) => {
                        console.log(error);
                        let message =
                          "An error occured while finalizing successful verification.";
                        res.redirect(
                          `/user/verified/error=true&message=${message}`
                        );
                      });
                  })
                  .catch((error) => {
                    console.log(error);
                    let message =
                      "An error occured while updating user record to show verified.";
                    res.redirect(
                      `/user/verified/error=true&message=${message}`
                    );
                  });
              } else {
                // existing record but incorrect verification details passed
                let message =
                  "Invalid verification details passed, Check your inbox.";
                res.redirect(`/user/verified/error=true&message=${message}`);
              }
            })
            .catch((error) => {
              console.log(error);
              let message = "An error occured while comparing unique strings.";
              res.redirect(`/user/verified/error=true&message=${message}`);
            });
        }
      } else {
        // user verification record doesn't exist
        let message =
          "Account record doesn't exist or has been verified already, Please sign up or log in";
        res.redirect(`user/verified/error=true&message=${message}`);
      }
    })
    .catch((error) => {
      console.log(error);
      let message =
        "An error occurred while checking for existing user verification record";
      res.redirect(`/user/verified/error=true&message=${message}`);
    });
});

// Verified page route
router.get("/verified", (req, res) => {
  res.sendFile(path.join(__dirname, "./../views/verified.html"));
});


// Signin
router.post("/signin", (req, res) => {
  let { email, password } = req.body;
  email = email.trim();
  password = password.trim();
  if (email == "" || password == "") {
    res.status(400).json({ message: "Empty credentials supplied" });
  } else {
    // Check if user exist
    User.find({ email })
      .then((data) => {
        if (data.length) {
          // User Exists

          // check if user is verified
          if (!data[0].verified) {
            res
              .status(400)
              .json({
                message: "Email hasn't been verified yet, Check your inbox.",
              });
          } else {
            const hashedPassword = data[0].password;
            bcrypt
              .compare(password, hashedPassword)
              .then((result) => {
                if (result) {
                  // Password Matched
                  res.status(200).json({ message: "Signin Successful", data });
                } else {
                  // Password Not Matched
                  res.status(400).json({ message: "Invalid Password entered" });
                }
              })
              .catch((err) => {
                res.status(500).json({
                  message: "An Error occurred while comparing Passwords",
                  err,
                });
              });
          }
        } else {
          res.status(400).json({
            message: "Invalid credentials entered!",
          });
        }
      })
      .catch((err) => {
        res.status(500).json({
          message: "An Error Occured while checking for existing user ",
        });
      });
  }
});

// route rest password , #POST method
router.post("/requestPasswordReset", (req, res) => {
  const { email, redirectURL } = req.body;

  // check if user is exists
  User.find({ email })
    .then((data) => {
      if (data.length > 0) {
        // User is  exists

        // check if user is verified
        if (!data[0].verified) {
          res
            .status(400)
            .json({
              message: "Email hasn't been verified yet, Check your inbox.",
            });
        } else {
          // proceed with email to reset password
          sendResetEmail(data[0], redirectURL, res);
        }
      } else {
        res
          .status(400)
          .json({ message: "No account with the supplied email exists." });
      }
    })
    .catch((error) => {
      console.log(error);
      res
        .status(500)
        .json({
          message: "An error occured while checking for existing user.",
        });
    });
});

const sendResetEmail = ({ _id, email }, redirectURL, res) => {
  const resetString = uuidv4() + _id;

  PasswordReset.deleteMany({ userId: _id })
    .then((result) => {
      // Reset records deleted successfully
      // Now we send the email

      // Email options
      const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Password Reset",
        html: `<p>We heard that you lost the password.</p><p>Don't worry, use the link below to reset it.</p><p>This link <b>expires in 60 minutes</b></p><p>Press <a href=${
          redirectURL + "/" + _id + "/" + resetString
        }>here</a> to proceed</p>`,
      };

      // hash the reset string
      const saltRounds = 10;
      bcrypt
        .hash(resetString, saltRounds)
        .then((hashedResetString) => {
          // set values in password reset collection
          const newPasswordReset = new PasswordReset({
            userId: _id,
            resetString: hashedResetString,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000,
          });
          newPasswordReset
            .save()
            .then(() => {
              transporter
                .sendMail(mailOptions)
                .then(() => {
                  // reset email send and password reset saved
                  res.status(200).json({
                    status: "PENDING",
                    message: "Password reset email sent",
                  });
                })
                .catch((error) => {
                  console.log(error);
                  res
                    .status(500)
                    .json({ message: "Password reset email failed" });
                });
            })
            .catch((error) => {
              console.log(error);
              res
                .status(500)
                .json({ message: "Couldn't save password reset data!" });
            });
        })
        .catch((error) => {
          console.log(error);
          res
            .status(500)
            .json({
              message:
                "An error occured while hashing the password reset data!",
            });
        });
    })
    .catch((error) => {
      // error while clearing existing records
      console.log(error);
      res
        .status(500)
        .json({ message: "Clearing existing password reset failed." });
    });
};

// Actually reset the Password
router.post("/resetPassword", (req, res) => {
  let { userId, resetString, newPasswordReset } = req.body;

  PasswordReset.find({ userId })
    .then((result) => {
      if (result.length > 0) {
        // password reset record exist sowe proceed

        const { expiresAt } = result[0];
        const hashedResetString = result[0].resetString;

        // checking for expired reset string
        if (expiresAt < Date.now()) {
          PasswordReset.deleteOne({ userId })
            .then(()=>{
              // reset record deleted successfully
              res.status(200).json({message: "Password reset link has expired."})
            })
            .catch((error) => {
              // delete failed
              console.log(error)
              res.status(500)
                .json({ message: "Clearing password reset record FAILED." });
            });
        } else {
          // valid reset record exists so we validate the reset string
          // First compare the hashed reset string
          bcrypt
          .compare(resetString, hashedResetString)
            .then(result => {
              if(result){
                // strings matched
                // hash password again
                const saltRounds = 10;
                bcrypt.hash(newPasswordReset, saltRounds)
                  .then(hashedNewPassword =>{
                    // updating user Password
                    User.updateOne(
                      { _id: userId },
                      { password: hashedNewPassword }
                    ).then(() => {
                      // update complete , Now delete reset record
                      PasswordReset.deleteOne({userId})
                        .then(() => {
                          // both user record and reset record updated
                          res.status(200).json({message: "Password has been reset successfully."})
                        })
                        .catch(error =>{
                          console.log(error)
                          res.status(500)
                            .json({messgae: "An error occured while finalizing password reset."})
                        })
                    })
                    .catch((error)=>{
                      console.log(error);
                      res.status(500)
                        .json({messgae: "Updating user password failed."})
                    })
                  })
                  .catch(error =>{
                    console.log(error)
                    res.status(500).json({message: "An error occured while hashing new password."})
                  })
              }else {
                // Existing record but incorrect reset string passed
                res.status(400).json({message: "Invalid password reset details passed"})
              }
            })
            .catch(error => {
              console.log(error)
              res.status(500).json({message: "Comparing password reset strings FAILED."})
            })
        }
      } else {
        // Password reset record doesn't exist
        res.status(404).json({ message: "Password reset request not found." });
      }
    })
    .catch((error) => {
      console.log(error);
      res
        .status(404)
        .json({
          message: "Checking for existing password reset record faild.",
        });
    });
});

module.exports = router;
